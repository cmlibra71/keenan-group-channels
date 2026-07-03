"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Price } from "@/components/ui/Price";
import { ga4AddToCart, ga4RemoveFromCart, type Ga4Item } from "@/components/analytics/ga4";

type CartItemRow = {
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

  const unitPrice = item.sale_price
    ? parseFloat(item.sale_price)
    : parseFloat(item.list_price);
  const lineTotal = unitPrice * item.quantity;

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
      try {
        const res = await updateCartItem(item.id, newQty);
        if (res?.error) {
          router.refresh();
          return;
        }
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
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleQuantity(item.quantity - 1)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
        <button
          onClick={() => handleQuantity(item.quantity + 1)}
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
