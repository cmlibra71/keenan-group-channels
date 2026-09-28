"use client";

// ============================================================================
// The buy controls under a REACT listing tile (IK parity, product cards). What is drawn is
// decided server-side by `lib/tile-buy.ts` (`TileBuyFacts`); this only draws it and runs the add.
//
//   mode "listing"  — Zoey's category tile: View Details, or Add to Quote above Add to Basket.
//   mode "search"   — Zoey's search tile: Add to Basket above Add to Quote; a product the tile
//                     cannot add shows "View Product" and an "Add to Quote" LINK, both to the
//                     product page (old site search, 2026-09-28).
//
// The add runs through the SAME handlers the authored tiles use (`builder/master-leaves.tsx`):
// the server cart / quote action — which refuses by the product's rules and a missing required
// answer, and then sends the shopper to the product page — the header badge update, the panel,
// and the analytics events. Rendered OUTSIDE the tile's link, so no control nests in an <a>.
// ============================================================================

import Link from "next/link";
import { useState } from "react";
import { useAddToCartHandler, useAddToQuoteHandler } from "@/builder/master-leaves";
import type { TileBuyFacts } from "@/lib/tile-buy";

const BTN = "w-full rounded-lg px-3 py-2 text-center text-sm font-semibold disabled:opacity-60";
const RED = `${BTN} bg-red-700 text-white hover:bg-red-800`;
const GREY = `${BTN} bg-zinc-400 text-white hover:bg-zinc-500`;

export function TileBuyButtons({
  mode,
  facts,
  productId,
  href,
  name,
  sku,
  price,
  brand,
}: {
  mode: "listing" | "search";
  facts: TileBuyFacts;
  productId: number;
  href: string;
  name: string;
  sku?: string | null;
  price?: number | null;
  brand?: string | null;
}) {
  const addToCart = useAddToCartHandler();
  const addToQuote = useAddToQuoteHandler();
  const [busy, setBusy] = useState<"cart" | "quote" | null>(null);
  // A refusal the handler does not turn into a trip to the product page (quote-only, stock, a
  // channel rule) is said on the tile, as the authored tile's toast says it — never a silent no-op.
  const [refused, setRefused] = useState<string | null>(null);

  const run = async (which: "cart" | "quote") => {
    if (busy) return;
    setBusy(which);
    setRefused(null);
    try {
      const res = which === "cart" ? await addToCart({ productId, name, sku, price, brand }) : await addToQuote({ productId });
      if (res && res.success === false) setRefused(which === "cart" ? "Could not add to basket" : "Could not add to quote");
    } catch {
      setRefused(which === "cart" ? "Could not add to basket" : "Could not add to quote");
    } finally {
      setBusy(null);
    }
  };
  const note = refused ? (
    <p role="status" className="text-center text-xs font-medium text-red-700" data-testid="tile-buy-refused">
      {refused}
    </p>
  ) : null;

  const cartBtn = facts.cart ? (
    <button type="button" className={RED} disabled={busy != null} onClick={() => run("cart")} data-testid="tile-add-to-basket">
      {busy === "cart" ? "Adding…" : "Add to Basket"}
    </button>
  ) : null;
  const quoteBtn = facts.quote ? (
    <button type="button" className={GREY} disabled={busy != null} onClick={() => run("quote")} data-testid="tile-add-to-quote">
      {busy === "quote" ? "Adding…" : "Add to Quote"}
    </button>
  ) : null;

  if (facts.viewDetails) {
    if (mode === "listing") {
      return (
        <div className="mt-3 flex flex-col gap-2" data-testid="tile-buy">
          <Link href={href} className={RED} data-testid="tile-view-details">
            View Details
          </Link>
        </div>
      );
    }
    return (
      <div className="mt-3 flex flex-col gap-2" data-testid="tile-buy">
        <Link href={href} className={RED} data-testid="tile-view-product">
          View Product
        </Link>
        {facts.quote && (
          <Link href={href} className={GREY} data-testid="tile-quote-link">
            Add to Quote
          </Link>
        )}
      </div>
    );
  }
  if (!cartBtn && !quoteBtn) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="tile-buy">
      {mode === "search" ? (
        <>
          {cartBtn}
          {quoteBtn}
        </>
      ) : (
        <>
          {quoteBtn}
          {cartBtn}
        </>
      )}
      {note}
    </div>
  );
}
