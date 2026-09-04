"use client";

import { useState, useTransition } from "react";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import type { KitChoice } from "@/lib/product-kit";
import type { AddonSelectionInput } from "@keenan/services/product-addons";

export function AddToQuoteButton({
  productId,
  variantId,
  disabled,
  kitChoices,
  label,
  addons,
  guard,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  /** BUNDLE products: the customer's pick per choice group, sent through with the request so a
   *  rep prices the configuration they actually asked for (card 7bmpuqei). */
  kitChoices?: KitChoice[] | null;
  label?: string;
  /** What the shopper configured on this page — ticked extras and typed answers
   *  (cards 0CDcCYmO + kyMjCmAw). Undefined on a listing tile, which offers no panel. */
  addons?: AddonSelectionInput | null;
  /** Run before the add; return false to stop it. See AddToCartButton. */
  guard?: () => boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // A REFUSED ADD SAYS SO. Both actions answer `{ error }` for things a tile
  // cannot know about — a product restricted away from online ordering, a
  // back-order policy of "deny", and now a required customisation the shopper has
  // not answered (cards 7vu2iEEZ, kyMjCmAw). The register's rule for those
  // surfaces is that the tile keeps its button and clicking it returns a PLAIN
  // REFUSAL (`sf-catalog-browse`), and 7bmpuqei's is that a CTA is never a button
  // that silently does nothing — this component used to drop the message on the
  // floor, so both read as a dead control. Shown under the button, cleared on the
  // next press.
  const [refusal, setRefusal] = useState<string | null>(null);
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function handleClick() {
    if (guard && !guard()) return;
    setRefusal(null);
    startTransition(async () => {
      const res = await addToQuote(productId, variantId, kitChoices ?? null, addons);
      // Fresh count from the action → badge updates without a route re-render,
      // and the quote panel pops out showing what was just added. A failed add
      // returns `{ error }`, so it stays closed.
      if (res && "error" in res && typeof res.error === "string") {
        setRefusal(res.error);
        return;
      }
      if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
        setQuoteCount(res.quoteCount);
        open("quote");
      }
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isPending}
        className="w-full border-2 border-zinc-900 text-zinc-900 py-3 px-6 rounded-lg font-semibold hover:bg-zinc-100 transition-colors disabled:border-zinc-300 disabled:text-zinc-300 disabled:cursor-not-allowed"
      >
        {isPending ? "Adding..." : label ?? "Add to Quote"}
      </button>
      {refusal && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {refusal}
        </p>
      )}
    </>
  );
}
