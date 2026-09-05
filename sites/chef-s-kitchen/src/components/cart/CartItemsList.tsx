"use client";

import { useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import { Minus, Plus, Trash2 } from "lucide-react";
import { backorderMessage } from "@keenan/services/backorder";
import {
  packNote as packNoteFor,
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
   * The SELLING UNIT, resolved server-side in `readCart` (cards O108e4jH / zeMPVcA3). A product
   * sold by the carton steps a whole carton at a time here and says what a carton holds — the
   * quantity in this row is always PIECES, which is what the money is priced in.
   */
  pack_size?: number | null;
  pack_unit?: string | null;
};

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
  const packNote = packNoteFor({
    sellPackSize: item.pack_size ?? null,
    sellPackUnit: item.pack_unit ?? null,
  });
  const packUnit = resolvePackUnit({ sellPackUnit: item.pack_unit ?? null });

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
        <p className="text-sm text-text-secondary mt-1"><Price amount={unitPrice} /> each</p>
        {packNote && (
          <p className="text-xs text-text-secondary mt-0.5">
            {packNote} {"\u00b7 "}
            <Price amount={packPrice(unitPrice, packSize)} />
            {` per ${packUnit.toLowerCase()}`}
          </p>
        )}
        {backorderNote && (
          <p className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
            {backorderNote}
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
        <span className="w-8 text-center text-sm font-medium">{displayQty}</span>
        <button
          onClick={() => handleQuantity(item.quantity + packSize)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total */}
      <div className="w-24 text-right">
        <Price amount={lineTotal} className="text-sm font-semibold text-text-primary" />
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
