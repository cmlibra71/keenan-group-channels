"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Price } from "@/components/ui/Price";

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

export function CartItemsList({ items }: { items: CartItemRow[] }) {
  return (
    <div className="divide-y divide-zinc-200">
      {items.map((item) => (
        <CartItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function CartItemRow({ item }: { item: CartItemRow }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const unitPrice = item.sale_price
    ? parseFloat(item.sale_price)
    : parseFloat(item.list_price);
  const lineTotal = unitPrice * item.quantity;

  // Never let a failed action escape the transition — an unhandled rejection here
  // escalates to the error boundary and blanks the whole site. On any failure,
  // refresh to re-sync the cart from the server instead.
  function handleQuantity(newQty: number) {
    startTransition(async () => {
      try {
        const res = await updateCartItem(item.id, newQty);
        if (res?.error) router.refresh();
      } catch {
        router.refresh();
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        const res = await removeCartItem(item.id);
        if (res?.error) router.refresh();
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
        <p className="text-sm text-zinc-600 mt-1"><Price amount={unitPrice} /> each</p>
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
        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
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
