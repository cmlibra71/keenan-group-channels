"use client";

import { useTransition } from "react";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { Minus, Plus, Trash2 } from "lucide-react";

type CartItemRow = {
  id: number;
  productId: number;
  variantId: number | null;
  quantity: number;
  listPrice: string;
  salePrice: string | null;
  extendedListPrice: string | null;
  extendedSalePrice: string | null;
  productName: string;
  productSlug: string | null;
  productSku: string | null;
  variantSku: string | null;
  variantOptionName: string | null;
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

  const unitPrice = item.salePrice
    ? parseFloat(item.salePrice)
    : parseFloat(item.listPrice);
  const lineTotal = unitPrice * item.quantity;

  function handleQuantity(newQty: number) {
    startTransition(async () => {
      await updateCartItem(item.id, newQty);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeCartItem(item.id);
    });
  }

  return (
    <div className={`py-4 flex items-center gap-4 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <a
          href={item.productSlug ? `/products/${item.productSlug}` : "#"}
          className="text-sm font-medium text-zinc-900 hover:underline truncate block"
        >
          {item.productName}
        </a>
        {item.variantOptionName && (
          <p className="text-xs text-zinc-500 mt-0.5">{item.variantOptionName}</p>
        )}
        <p className="text-xs text-zinc-400 mt-0.5">
          SKU: {item.variantSku || item.productSku || "N/A"}
        </p>
        <p className="text-sm text-zinc-600 mt-1">${unitPrice.toFixed(2)} each</p>
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
        <span className="text-sm font-semibold text-zinc-900">${lineTotal.toFixed(2)}</span>
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
