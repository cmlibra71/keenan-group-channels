"use client";

import { useTransition } from "react";
import { addToQuote } from "@/lib/actions/quote";

export function AddToQuoteButton({
  productId,
  variantId,
  disabled,
  size,
  label,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  size?: "sm";
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await addToQuote(productId, variantId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className={`btn-secondary w-full ${size === "sm" ? "btn-sm" : ""}`}
    >
      {isPending ? "Adding..." : label ?? "Add to Quote"}
    </button>
  );
}
