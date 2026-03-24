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
      className="w-full border border-stone text-ink hover:border-navy/30 transition-colors duration-300 py-3.5 px-7 font-medium text-sm tracking-wide disabled:border-stone disabled:text-ink-faint disabled:cursor-not-allowed"
    >
      {isPending ? "Adding..." : "Add to Quote"}
    </button>
  );
}
