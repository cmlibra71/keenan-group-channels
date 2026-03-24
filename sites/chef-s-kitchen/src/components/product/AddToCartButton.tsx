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
      className="btn-primary w-full"
    >
      {isPending ? "Adding..." : "Add to Cart"}
    </button>
  );
}
