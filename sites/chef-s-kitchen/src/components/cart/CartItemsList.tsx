"use client";

import { useState, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import { CART_RESTRICTED_ERROR, cartLineNotice } from "@/lib/cart/restricted-message";
import { Minus, Plus, Trash2 } from "lucide-react";
import { backorderMessage } from "@keenan/services/backorder";
import {
  packNote as packNoteFor,
  boxQuantity,
  packCountSentence,
  packPrice,
  resolvePackSize,
  resolvePackUnit,
} from "@keenan/services/pack";
import { Price } from "@/components/ui/Price";
import { ga4AddToCart, ga4RemoveFromCart, type Ga4Item } from "@/components/analytics/ga4";

export type CartItemRow = {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  list_price: string;
  sale_price: string | null;
  extended_list_price: string | null;
  extended_sale_price: string | null;
  product_name: string;
  product_slug: string | null;
  product_sku: string | null;
  variant_sku: string | null;
  variant_option_name: string | null;
  /** The product's brand, carried so the island can decide brand free shipping (card 88Ay7UGA). */
  brand_id?: number | null;
  /**
   * Units of this product a shopper can have without waiting — `null` on an untracked product,
   * which has no ceiling. Carried per line rather than a precomputed shortfall so the back-order
   * note follows the OPTIMISTIC quantity on screen instead of lagging a round trip behind the
   * +/- buttons. (Card 7vu2iEEZ.)
   */
  available_units?: number | null;
  /** deny | allow_silent | allow_notify — only allow_notify says anything to the shopper. */
  backorder_policy?: string | null;
  /**
   * `products.restrict_add_to_cart` (card 7vu2iEEZ): staff switched this product
   * off for online ordering. The line SAYS SO and cannot be increased — card
   * 1sgz4B3v, so the shopper the checkout tells to review their cart has
   * something to find. Reducing and removing stay allowed (`sf-cart`).
   */
  restrict_add_to_cart?: boolean | null;
  /**
   * The paid extras this line was configured with (card 0CDcCYmO), as stored on
   * `cart_items.modifier_selections`. Their price is already INSIDE the line's unit price —
   * this is the record of what was chosen, so the shopper can see what they are paying the
   * difference for. Absent on every line that has none.
   */
  modifier_selections?: unknown;
  /**
   * The SELLING UNIT, resolved server-side in `readCart` (cards O108e4jH / zeMPVcA3). A product
   * sold by the carton steps a whole carton at a time here and says what a carton holds — the
   * quantity in this row is always PIECES, which is what the money is priced in.
   */
  pack_size?: number | null;
  pack_unit?: string | null;
  /** Zoey's wording for this line, resolved server-side (card O108e4jH): "Case contains 6
   *  Bottles", or "Sold in multiples of 12" where Enable Packaging is off. */
  pack_note?: string | null;
  /** Enable Packaging — false means there is no package to price on this line. */
  pack_packaging?: boolean | null;
  /** Zoey's Unit Label ("Pcs" / "Bottles"), for the "2 Cartons = 48 Pcs" line (card O108e4jH). */
  pack_unit_label?: string | null;
  /**
   * What this line took from a promotion, resolved server-side in `readCart`
   * (card p6YVxc4P). The line's own unit price is UNTOUCHED — the offer is a
   * separate reduction, exactly as it lands on `order_items.discount_amount` —
   * so the row shows the price the catalogue charges and the saving beside it.
   * Null on a line that took nothing.
   */
  offer_discount?: number | null;
  offer_name?: string | null;
  offer_percent?: number | null;
};

/** The picked extras on a cart line, read defensively — the column is jsonb. */
function lineAddonLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      const label = typeof r.optionLabel === "string" ? r.optionLabel : null;
      if (!label) return null;
      const group = typeof r.groupLabel === "string" ? r.groupLabel : null;
      return group ? `${group}: ${label}` : label;
    })
    .filter((l): l is string => l !== null);
}

export function CartItemsList({
  items,
  onMutate,
}: {
  items: CartItemRow[];
  // Called after a successful mutation so a client-state consumer (the cart popout)
  // can re-fetch. Omitted on the /cart page, which re-renders via revalidatePath.
  onMutate?: () => void | Promise<void>;
}) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <CartItemRow key={item.id} item={item} onMutate={onMutate} />
      ))}
    </div>
  );
}

function CartItemRow({ item, onMutate }: { item: CartItemRow; onMutate?: () => void | Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setCartCount } = useCartQuoteCounts();
  // Instant on click; auto-reverts to the prop if the transition ends without
  // fresh items (error → refresh self-heal).
  const [displayQty, setDisplayQty] = useOptimistic(item.quantity);
  /**
   * What the SERVER said when it refused the last +/- (card 1sgz4B3v). The
   * refusal used to be swallowed: `updateCartItem` returned `{ error }` and this
   * row answered it with `router.refresh()` alone, which the slide-out drawer —
   * holding its items in client state — never sees, so a refused "+" left the
   * optimistic number on screen with nothing said. Shown on the row, and the
   * quantity is put back by re-reading the cart.
   */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Staff switched this product off for online ordering: the standing reason,
   *  shown whether or not the shopper has just pressed anything. */
  const restricted = item.restrict_add_to_cart === true;
  const notice = cartLineNotice(refusal, restricted);

  const unitPrice = item.sale_price
    ? parseFloat(item.sale_price)
    : parseFloat(item.list_price);
  const lineTotal = unitPrice * displayQty;

  /**
   * The back-order note — Tim's wording, verbatim (card 7vu2iEEZ). Worked out from the
   * OPTIMISTIC quantity, so it appears, recounts and disappears as the shopper clicks +/-.
   *
   * This is the only availability wording left on these storefronts: card CXnP1lrL removed
   * "In stock", "Check availability", "Ships to order" and the "Low Stock" tag from every page.
   * If it goes, an out-of-stock line passes through the cart with nothing said on any screen.
   */
  const backorderNote = backorderMessage(
    {
      inventoryTracking: item.available_units == null ? "none" : "product",
      inventoryLevel: item.available_units ?? null,
      backorderPolicy: item.backorder_policy ?? null,
    },
    displayQty
  );

  // GA4 add/remove_from_cart carry the CHANGED quantity, not the line total.
  function ga4Item(qty: number): Ga4Item {
    return {
      item_id: item.variant_sku ?? item.product_sku ?? String(item.product_id),
      item_name: item.product_name,
      item_variant: item.variant_option_name ?? undefined,
      price: unitPrice,
      quantity: qty,
    };
  }

  // Never let a failed action escape the transition — an unhandled rejection here
  // escalates to the error boundary and blanks the whole site. On any failure,
  // refresh to re-sync the cart from the server instead.
  // 1 on everything that is not sold by the carton, so this row behaves exactly as it always has.
  const packSize = resolvePackSize({ sellPackSize: item.pack_size ?? null });
  // The server's sentence wins (it knows Enable Packaging, the Unit Label and the shopper's
  // group row); the local one covers a line object from before those fields existed.
  const packNote =
    item.pack_note !== undefined
      ? item.pack_note
      : packNoteFor({
          sellPackSize: item.pack_size ?? null,
          sellPackUnit: item.pack_unit ?? null,
        });
  const packPriced = item.pack_packaging !== false;
  const packUnit = resolvePackUnit({ sellPackUnit: item.pack_unit ?? null });
  // Card O108e4jH (Tim 2026-09-21, "copy Zoey"): with Enable Packaging on, the shopper counts
  // PACKAGES, as Zoey's cart does — the box reads 2 and the line under the name "2 Cartons = 48
  // Pcs". The line itself, its price and every write stay in PIECES; only what is SHOWN is
  // translated, and it follows the optimistic quantity so +/- recounts instantly.
  const countsPacks = packSize > 1 && packPriced;
  const shownQty = boxQuantity(displayQty, packSize, countsPacks);
  const packLine = countsPacks
    ? packCountSentence(displayQty, packSize, item.pack_unit ?? null, item.pack_unit_label ?? null)
    : packNote;

  function handleQuantity(newQty: number) {
    startTransition(async () => {
      setRefusal(null);
      setDisplayQty(Math.max(0, newQty));
      try {
        const res = await updateCartItem(item.id, newQty);
        if (res?.error) {
          // SAY IT. `onMutate` re-reads the cart so the drawer's own client state
          // (and with it the quantity) goes back to what the server holds; the
          // /cart page self-heals on the refresh. Neither alone is enough.
          setRefusal(res.error);
          await onMutate?.();
          router.refresh();
          return;
        }
        // Fresh count from the action → header badge updates in place.
        if (typeof res?.cartCount === "number") setCartCount(res.cartCount);
        // Fire GA4 with the delta (the +/− adjusters change one unit at a time,
        // but guard for any step size). newQty <= 0 removes the whole line.
        const delta = Math.max(0, newQty) - item.quantity;
        if (delta > 0) ga4AddToCart(ga4Item(delta));
        else if (delta < 0) ga4RemoveFromCart(ga4Item(-delta));
        // Re-sync the popout's client-state cart (no-op on the /cart page).
        await onMutate?.();
      } catch {
        router.refresh();
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        const res = await removeCartItem(item.id);
        if (res?.error) {
          router.refresh();
          return;
        }
        if (typeof res?.cartCount === "number") setCartCount(res.cartCount);
        ga4RemoveFromCart(ga4Item(item.quantity));
        await onMutate?.();
      } catch {
        router.refresh();
      }
    });
  }

  const addonLabels = lineAddonLabels(item.modifier_selections);
  // The offer is resolved against the SAVED quantity, so while a +/- click is in
  // flight the saving would be a round trip stale. Hide it for that beat rather
  // than print a figure that belongs to the previous quantity.
  const offerDiscount =
    !isPending && displayQty === item.quantity && item.offer_discount != null
      ? Number(item.offer_discount)
      : 0;

  return (
    <div className={`py-4 flex items-center gap-4 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <a
          href={item.product_slug ? `/products/${item.product_slug}` : "#"}
          className="text-sm font-medium text-text-primary hover:underline truncate block"
        >
          {item.product_name}
        </a>
        {item.variant_option_name && (
          <p className="text-xs text-text-secondary mt-0.5">{item.variant_option_name}</p>
        )}
        <p className="text-xs text-text-muted mt-0.5">
          SKU: {item.variant_sku || item.product_sku || "N/A"}
        </p>
        {/* What this line was configured with. The extras' price is already in the unit
            price below, so this is the only place the shopper can see WHY two of the same
            machine cost different amounts. (Card 0CDcCYmO.) */}
        {addonLabels.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {addonLabels.map((label) => (
              <li key={label} className="text-xs text-text-secondary">
                + {label}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-text-secondary mt-1"><Price amount={unitPrice} /> each</p>
        {packLine && (
          <p className="text-xs text-text-secondary mt-0.5">
            {packLine}
            {packPriced && (
              <>
                {" \u00b7 "}
                <Price amount={packPrice(unitPrice, packSize)} />
                {` per ${packUnit.toLowerCase()}`}
              </>
            )}
          </p>
        )}
        {offerDiscount > 0 && item.offer_name && (
          <p className="mt-1 text-xs font-medium text-brand">
            {item.offer_name}
            {item.offer_percent ? ` — ${item.offer_percent}% off` : ""}
          </p>
        )}
        {backorderNote && (
          <p className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
            {backorderNote}
          </p>
        )}
        {/* Card 1sgz4B3v. `cartLineNotice` owns the precedence (unit-tested):
            what the SERVER said about the last change wins, otherwise the
            standing reason, otherwise nothing. So no press here is ever silent
            and a refusal never gets answered with the wrong sentence. */}
        {notice && (
          <p
            role="status"
            className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
          >
            {notice}
          </p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleQuantity(item.quantity - packSize)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-8 px-1 text-center text-sm font-medium">{shownQty}</span>
        <button
          onClick={() => handleQuantity(item.quantity + packSize)}
          // A restricted line may be reduced and removed, never increased — the
          // server refuses it anyway (`refuseCartQuantity`), and a button that
          // only ever refuses is the control this card exists to remove.
          disabled={isPending || restricted}
          title={restricted ? CART_RESTRICTED_ERROR : undefined}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total. An offer is shown as a REDUCTION under the line rather than
          folded into the unit price, because that is exactly how it lands on the
          order (`order_items.discount_amount`) — the price is the catalogue's,
          the saving is the offer's. (Card p6YVxc4P.) */}
      <div className="w-24 text-right">
        <Price amount={lineTotal} className="text-sm font-semibold text-text-primary" />
        {offerDiscount > 0 && (
          <p className="mt-0.5 text-xs font-medium text-brand">
            −<Price amount={offerDiscount} />
          </p>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-text-muted hover:text-sale disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
