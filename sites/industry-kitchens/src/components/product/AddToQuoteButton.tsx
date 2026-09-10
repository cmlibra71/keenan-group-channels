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
  kitChoices,
  addons,
  label,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  /** BUNDLE products: the customer's pick per choice group, sent through with the request so a
   *  rep prices the configuration they actually asked for (card 7bmpuqei). */
  kitChoices?: KitChoice[] | null;
  /** Paid extras the shopper ticked (card 0CDcCYmO), group key -> option keys. The panel sits
   *  above BOTH buy buttons, so this button carries them too: a rep who receives a bare machine
   *  never learns which accessories the customer was looking at. Keys only — every label and
   *  price is re-read from the product's own definition in the action, and they move no money. */
  addons?: AddonSelectionInput;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function handleClick() {
    startTransition(async () => {
      const res = await addToQuote(productId, variantId, kitChoices ?? null, addons ?? null);
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
      className="w-full border-2 border-zinc-900 text-zinc-900 py-3 px-6 rounded-lg font-semibold hover:bg-zinc-100 transition-colors disabled:border-zinc-300 disabled:text-zinc-300 disabled:cursor-not-allowed"
    >
      {isPending ? "Adding..." : label ?? "Add to Quote"}
    </button>
  );
}
