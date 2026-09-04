"use client";

import { useTransition } from "react";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import type { KitChoice } from "@/lib/product-kit";
import type { AddonSelectionInput } from "@keenan/services/product-addons";

export function AddToQuoteButton({
  productId,
  variantId,
  disabled,
  size,
  label,
  kitChoices,
  addons,
  guard,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  size?: "sm";
  label?: string;
  /** BUNDLE products: the customer's pick per choice group, sent through with the request so a
   *  rep prices the configuration they actually asked for (card 7bmpuqei). */
  kitChoices?: KitChoice[] | null;
  /** What the shopper configured on this page — ticked extras and typed answers
   *  (cards 0CDcCYmO + kyMjCmAw). Undefined on a listing tile, which offers no panel. */
  addons?: AddonSelectionInput | null;
  /** Run before the add; return false to stop it. See AddToCartButton. */
  guard?: () => boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function handleClick() {
    if (guard && !guard()) return;
    startTransition(async () => {
      const res = await addToQuote(productId, variantId, kitChoices ?? null, addons);
      // Fresh count from the action → badge updates without a route re-render,
      // and the quote panel pops out showing what was just added. A failed add
      // returns `{ error }`, so it stays closed.
      if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
        setQuoteCount(res.quoteCount);
        open("quote");
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
