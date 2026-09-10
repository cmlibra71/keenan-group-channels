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
  size,
  label,
  kitChoices,
  addons,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  size?: "sm";
  label?: string;
  /** BUNDLE products: the customer's pick per choice group, sent through with the request so a
   *  rep prices the configuration they actually asked for (card 7bmpuqei). */
  kitChoices?: KitChoice[] | null;
  /** Paid extras the shopper ticked (card 0CDcCYmO), group key -> option keys. The panel sits
   *  above BOTH buy buttons, so this button carries them too: a rep who receives a bare machine
   *  never learns which accessories the customer was looking at. Keys only — every label and
   *  price is re-read from the product's own definition in the action, and they move no money. */
  addons?: AddonSelectionInput;
}) {
  const [isPending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function handleClick() {
    setRefusal(null);
    startTransition(async () => {
      const res = await addToQuote(productId, variantId, kitChoices ?? null, addons ?? null);
      // Fresh count from the action → badge updates without a route re-render,
      // and the quote panel pops out showing what was just added. A failed add
      // returns `{ error }`, so it stays closed.
      // A REFUSED ADD SAYS SO — same rule as the cart button beside it
      // (`sf-product-page` / `sf-catalog-browse`, 7bmpuqei x 7vu2iEEZ). This is the
      // press that carries the required-answer refusal on a quote-only product, so
      // dropping it would leave the shopper a button that does nothing at all.
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
        className={`btn-secondary w-full ${size === "sm" ? "btn-sm" : ""}`}
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
