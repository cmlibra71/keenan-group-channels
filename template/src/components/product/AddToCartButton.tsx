"use client";

import { useTransition } from "react";
import { addToCart } from "@/lib/actions/cart";

export function AddToCartButton({
  productId,
  variantId,
  disabled,
  size,
  label,
  quantity,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  size?: "sm";
  label?: string;
  quantity?: number;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await addToCart(productId, variantId, quantity ?? 1);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className={`w-full bg-zinc-900 text-white rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 disabled:cursor-not-allowed ${
        size === "sm" ? "py-2 px-4 text-sm" : "py-3 px-6"
      }`}
    >
      {isPending ? "Adding..." : label ?? "Add to Cart"}
    </button>
  );
}
