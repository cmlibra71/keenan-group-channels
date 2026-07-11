"use client";

import { useTransition } from "react";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";

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
  const { setQuoteCount } = useCartQuoteCounts();

  function handleClick() {
    startTransition(async () => {
      const res = await addToQuote(productId, variantId);
      // Fresh count from the action → badge updates without a route re-render.
      if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
        setQuoteCount(res.quoteCount);
      }
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
