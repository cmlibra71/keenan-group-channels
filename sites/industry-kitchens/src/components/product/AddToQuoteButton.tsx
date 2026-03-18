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
      className="w-full border-2 border-zinc-900 text-zinc-900 py-3 px-6 rounded-lg font-semibold hover:bg-zinc-100 transition-colors disabled:border-zinc-300 disabled:text-zinc-300 disabled:cursor-not-allowed"
    >
      {isPending ? "Adding..." : "Add to Quote"}
    </button>
  );
}
