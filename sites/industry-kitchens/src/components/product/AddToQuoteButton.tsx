"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import type { KitChoice } from "@/lib/product-kit";
import type { AddonSelectionInput } from "@keenan/services/product-addons";
import { tileRefusalDestination } from "@/lib/product/addon-panel";

/** What one Add to Quote press returns to its caller (a template action shows it as a toast). */
export type QuoteAddResult = { success?: boolean; error?: string } & Record<string, unknown>;

/**
 * THE add-to-quote press, shared by this button and the bundle's own path (the kit native, which a
 * template's "Price as configured" bar can fire — IK parity, Zoey's fixed bundle bar): the same
 * action, the same refusal handling, the same badge update and quote panel. Returns the result so
 * a caller can report it.
 */
export function useQuoteAdd(productId: number) {
  const [isPending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();
  const router = useRouter();
  const add = (opts: {
    variantId?: number | null;
    kitChoices?: KitChoice[] | null;
    addons?: AddonSelectionInput;
    quantity?: number | null;
  }): Promise<QuoteAddResult> =>
    new Promise((resolve) => {
      setRefusal(null);
      startTransition(async () => {
        const res = (await addToQuote(productId, opts.variantId, opts.kitChoices ?? null, opts.addons ?? null, opts.quantity ?? null)) as QuoteAddResult | undefined;
        // Fresh count from the action → badge updates without a route re-render,
        // and the quote panel pops out showing what was just added. A failed add
        // returns `{ error }`, so it stays closed.
        // A REFUSED ADD SAYS SO — same rule as the cart button beside it
        // (`sf-product-page` / `sf-catalog-browse`, 7bmpuqei x 7vu2iEEZ). This is the
        // press that carries the required-answer refusal on a quote-only product, so
        // dropping it would leave the shopper a button that does nothing at all.
        if (res && "error" in res && typeof res.error === "string") {
          setRefusal(res.error);
          // Same as the cart button (card tkvntxsq): a TILE's refusal over an unanswered
          // required question carries the product page, and the shopper is taken there to
          // answer it. From the product page itself the action returns no destination.
          const destination = tileRefusalDestination(res);
          if (destination) router.push(destination);
          resolve(res);
          return;
        }
        if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
          setQuoteCount(res.quoteCount);
          open("quote");
        }
        resolve({ ...(res ?? {}), success: true });
      });
    });
  return { add, isPending, refusal };
}

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
  const { add, isPending, refusal } = useQuoteAdd(productId);
  function handleClick() {
    void add({ variantId, kitChoices, addons });
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
