"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBundleToCart, addBundleToQuote } from "@/lib/actions/bundles";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";

/**
 * "Add the bundle" — one click, on to the cart or the quote (card p6YVxc4P).
 *
 * Both buttons post only the SLUG. What the bundle contains and what it costs is
 * read from the database inside the action, so a hand-made post can pick a
 * different bundle but can never invent one or change its contents.
 *
 * A refusal SAYS SO, the same rule the product page's buy buttons follow: a
 * component staff have switched off for online ordering leaves a sentence naming
 * it, rather than a button that appears to do nothing.
 */
export function BundleBuyButtons({ slug, disabled }: { slug: string; disabled?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<null | "cart" | "quote">(null);
  const { setCartCount, setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function run(where: "cart" | "quote") {
    setNotice(null);
    setDone(null);
    startTransition(async () => {
      const result =
        where === "cart" ? await addBundleToCart(slug) : await addBundleToQuote(slug);
      if (result.error && !result.success) {
        setNotice(result.error);
        return;
      }
      if (result.error) setNotice(result.error);
      setDone(where);
      // The badge takes the count the LAST successful add returned, so the header
      // moves without a route re-render — the same contract the product page's own
      // buy buttons use.
      if (where === "cart" && "cartCount" in result && typeof result.cartCount === "number") {
        setCartCount(result.cartCount);
      }
      if (where === "quote" && "quoteCount" in result && typeof result.quoteCount === "number") {
        setQuoteCount(result.quoteCount);
      }
      open(where);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => run("cart")}
          disabled={isPending || disabled}
          className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 text-center font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add bundle to cart"}
        </button>
        <button
          type="button"
          onClick={() => run("quote")}
          disabled={isPending || disabled}
          className="flex-1 rounded-lg border border-zinc-900 px-6 py-3 text-center font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          Add bundle to quote
        </button>
      </div>
      {done && !notice && (
        <p role="status" className="mt-3 text-sm font-medium text-green-700">
          Bundle added to your {done}.
        </p>
      )}
      {notice && (
        <p role="alert" className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}
        </p>
      )}
    </div>
  );
}
