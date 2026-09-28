"use client";

// ============================================================================
// "Add to Compare" under a LISTING TILE (IK parity, root cause compare-feature):
// the old site's category tiles each carried a small "Add to Compare" link under
// the buttons, which turned into a red "View Compare" once the product was in
// the list. Same list (the visitor's cookie) as the product page's control.
//
// Rendered two ways, one component:
//   * the authored `product-card` master — as the sealed native `tile-compare`,
//     placed by `builder/tile-compare-node.ts` beside each card with
//     `productId` bound to the row (`props.card.id`), registered on the
//     category, brand and product pages, and hidden where the page's own Zoey
//     list hid it (`context.listing.compare`, IK parity product cards);
//   * the React `ProductGrid` — directly, where a call site asks (`showCompare`).
//     Zoey's search and clearance lists carried no compare link, so those
//     call sites no longer ask.
// It sits OUTSIDE the tile's link, so neither state nests a control in an <a>.
// ============================================================================

import Link from "next/link";
import { useCompareList } from "@/lib/compare/use-compare-list";
import { COMPARE_PATH } from "@/lib/compare/compare-path";

export function TileCompare({ productId }: { productId?: unknown }) {
  const { add, has } = useCompareList();
  const id = typeof productId === "number" ? productId : Number(productId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    <div className="mt-2 text-center" data-testid="tile-compare">
      {has(id) ? (
        <Link href={COMPARE_PATH} className="text-xs font-medium text-red-600 hover:underline" data-testid="tile-view-compare">
          View Compare
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => add(id)}
          className="text-xs text-zinc-600 hover:text-zinc-900 hover:underline"
          data-testid="tile-add-to-compare"
        >
          Add to Compare
        </button>
      )}
    </div>
  );
}
