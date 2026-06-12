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
      className={`btn-primary w-full ${size === "sm" ? "btn-sm" : ""}`}
    >
      {isPending ? "Adding..." : label ?? "Add to Cart"}
    </button>
  );
}
