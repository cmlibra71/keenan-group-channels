"use client";

import { useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import { Minus, Plus, Trash2 } from "lucide-react";
import { backorderMessage } from "@keenan/services/backorder";
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
   * The paid extras this line was configured with (card 0CDcCYmO), as stored on
   * `cart_items.modifier_selections`. Their price is already INSIDE the line's unit price —
   * this is the record of what was chosen, so the shopper can see what they are paying the
   * difference for. Absent on every line that has none.
   */
  modifier_selections?: unknown;
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
  // Called after a successful mutation so the client-state consumer (the cart
  // popout / the /cart page island) can re-fetch its items and totals.
  onMutate?: () => void | Promise<void>;
}) {
  return (
    <div className="divide-y divide-zinc-200">
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
  // The displayed quantity flips instantly on click and auto-reverts to the
  // prop if the transition ends without fresh items (error → refresh self-heal).
  const [displayQty, setDisplayQty] = useOptimistic(item.quantity);

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
  function handleQuantity(newQty: number) {
    startTransition(async () => {
      setDisplayQty(Math.max(0, newQty));
      try {
        const res = await updateCartItem(item.id, newQty);
        if (res?.error) {
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

  return (
    <div className={`py-4 flex items-center gap-4 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <a
          href={item.product_slug ? `/products/${item.product_slug}` : "#"}
          className="text-sm font-medium text-zinc-900 hover:underline truncate block"
        >
          {item.product_name}
        </a>
        {item.variant_option_name && (
          <p className="text-xs text-zinc-500 mt-0.5">{item.variant_option_name}</p>
        )}
        <p className="text-xs text-zinc-400 mt-0.5">
          SKU: {item.variant_sku || item.product_sku || "N/A"}
        </p>
        {/* What this line was configured with. The extras' price is already in the unit
            price below, so this is the only place the shopper can see WHY two of the same
            machine cost different amounts. (Card 0CDcCYmO.) */}
        {addonLabels.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {addonLabels.map((label) => (
              <li key={label} className="text-xs text-zinc-600">
                + {label}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-zinc-600 mt-1"><Price amount={unitPrice} /> each</p>
        {backorderNote && (
          <p className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
            {backorderNote}
          </p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleQuantity(item.quantity - 1)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center text-sm font-medium">{displayQty}</span>
        <button
          onClick={() => handleQuantity(item.quantity + 1)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total */}
      <div className="w-24 text-right">
        <Price amount={lineTotal} className="text-sm font-semibold text-zinc-900" />
      </div>

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
