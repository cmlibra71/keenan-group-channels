"use client";

import { useTransition } from "react";
import { addToQuote } from "@/lib/actions/quote";

export function AddToQuoteButton({
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
      await addToQuote(productId, variantId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className="btn-secondary w-full"
    >
      {isPending ? "Adding..." : "Add to Quote"}
    </button>
  );
}
