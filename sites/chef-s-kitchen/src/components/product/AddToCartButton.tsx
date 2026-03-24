"use client";

import { useTransition } from "react";
import { addToCart } from "@/lib/actions/cart";

export function AddToCartButton({
  productId,
  variantId,
  disabled,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await addToCart(productId, variantId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className="w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint disabled:cursor-not-allowed"
    >
      {isPending ? "Adding..." : "Add to Cart"}
    </button>
  );
}
