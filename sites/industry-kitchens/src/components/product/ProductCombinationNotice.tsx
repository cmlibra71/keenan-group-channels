"use client";

import { useProductPurchaseOptional } from "@keenan/services/product-page";

// ============================================================================
// "We do not make that combination" — card VNh9DdYd (Chris, 2026-09-17).
//
// The Fifo Bottle Portion Pal Kit offers 2 bottle sizes x 3 cap patterns x 5
// valves = 30 combinations, and 22 of them are made. Pick one of the other eight
// and Add to Cart simply went grey with nothing on the page saying why. That is
// the dead control `docs/behaviour/catalogue.md` > sf-product-page forbids: card
// CXnP1lrL removed every availability string that used to explain one, so a
// greyed button on this page has to bring its own words.
//
// IT IS A SEPARATE SENTENCE FROM TIM'S BACK-ORDER WORDING. "This product is not
// available in the requested quantity. X of the items will be backordered."
// (7vu2iEEZ, Tim 2026-08-11) is fixed, lives in the cart, and is never reused,
// reworded or trimmed. This one is about a combination we never built — a
// different fact, on a different screen, in its own words.
//
// It says NOTHING about stock: an unmade combination is not an out-of-stock
// product, and out of stock stays buyable as a back order on both storefronts.
//
// Why a coded leaf rather than a node in the stored tree: both storefronts render
// this page from an AUTHORED node tree in the database, so there is no node here
// to edit and a class invented in a stored tree has no rule in the deployed
// stylesheet. Same choice the illustrative-image banner (82HgV23q) and the
// SilverChef panel (6f47rFeT) made. Placement is a pure pass over the tree —
// `builder/product-combination-notice.ts`.
// ============================================================================

/**
 * The sentence, in Chris's own framing: we do not make that combination, try
 * another. Exported so the placement test and any future surface quote the one
 * string rather than a paraphrase of it.
 */
export const COMBINATION_UNAVAILABLE_TEXT =
  "We do not make that combination. Please try a different one.";

/**
 * Renders NOTHING unless every variation option has been answered and no variant
 * carries that combination (`combinationUnavailable`, resolved once in
 * `@keenan/services/product-page`). A product with no options, or one mid-pick,
 * shows nothing — a half-finished selection already explains itself through the
 * picker still reading "Select …".
 */
export function ProductCombinationNotice({ className = "mt-4" }: { className?: string }) {
  const purchase = useProductPurchaseOptional();
  if (!purchase?.combinationUnavailable) return null;
  return (
    <div className={className}>
      <p
        role="status"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        {COMBINATION_UNAVAILABLE_TEXT}
      </p>
    </div>
  );
}

export default ProductCombinationNotice;
