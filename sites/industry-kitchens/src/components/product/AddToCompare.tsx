"use client";

// ============================================================================
// "Add to Compare" on the Industry Kitchens product page (IK parity plan
// decision 12, root cause `compare-feature` — 58 audits saw it on the old site).
//
// The old page (www.industrykitchens.com.au, 2026-09-28) carried, directly under
// ADD TO BASKET:
//   * a small "Add to Compare" link that added the product to the visitor's
//     compare list and then read "View Compare" (pressing THAT opened the list);
//   * a "COMPARE PRODUCTS HERE" button to the compare page, always shown.
// Both are reproduced here, same order, same wording. The list is the visitor's
// cookie (`lib/compare/compare-list.ts`) — nothing is written to the database.
//
// SEALED native (`product-compare`, registered in `builder/product-natives.tsx`)
// because it carries client state of its own — which products are in the list —
// that an authored tree cannot hold. It is placed on the live page by the
// `withCompareNode` pass; an author may place it themselves in the product
// template, and the pass then leaves their placement alone.
// ============================================================================

import Link from "next/link";
import { useProductPurchaseOptional } from "@keenan/services/product-page";
import { useCompareList } from "@/lib/compare/use-compare-list";
import { COMPARE_PATH } from "@/lib/compare/compare-path";

export function AddToCompare({ productId: explicitId }: { productId?: number }) {
  const purchase = useProductPurchaseOptional();
  const productId = explicitId ?? Number(purchase?.product?.id);
  const { list, add, has } = useCompareList();
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const inList = has(productId);

  return (
    <div className="mt-4 flex flex-col items-center gap-2" data-testid="product-compare">
      {inList ? (
        <Link
          href={COMPARE_PATH}
          className="text-sm text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
          data-testid="view-compare"
        >
          View Compare
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => add(productId)}
          className="text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline"
          data-testid="add-to-compare"
        >
          Add to Compare
        </button>
      )}
      <Link
        href={COMPARE_PATH}
        className="rounded-lg border border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition-colors hover:bg-zinc-100"
        data-testid="compare-products-here"
      >
        Compare products here{list.length > 0 ? ` (${list.length})` : ""}
      </Link>
    </div>
  );
}
