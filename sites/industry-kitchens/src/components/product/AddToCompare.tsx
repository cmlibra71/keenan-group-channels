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

/**
 * Wording and shape come from the template node's props (CMS data; today's words when a prop is unset,
 * nothing when it is set to ""):
 *   label_add / label_view    the per-product link ("Add to Compare" / "View Compare");
 *   label_here                the button to the compare page ("Compare products here"); "" = no button;
 *   sidebar_title / sidebar_empty / sidebar_compare
 *                             Zoey's "Compare Products" sidebar block on layouts that carry it instead of
 *                             the button ("Compare Products" / "You have no items to compare." /
 *                             "Compare"); shown only when sidebar_title is set.
 */
export interface CompareLabels {
  label_add?: string | null;
  label_view?: string | null;
  label_here?: string | null;
  sidebar_title?: string | null;
  sidebar_empty?: string | null;
  sidebar_compare?: string | null;
}

export function AddToCompare({ productId: explicitId, labels = {} }: { productId?: number; labels?: CompareLabels }) {
  const purchase = useProductPurchaseOptional();
  const productId = explicitId ?? Number(purchase?.product?.id);
  const { list, add, has } = useCompareList();
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const inList = has(productId);
  const word = (v: string | null | undefined, fallback: string) => (typeof v === "string" ? v : fallback);
  const addLabel = word(labels.label_add, "Add to Compare");
  const viewLabel = word(labels.label_view, "View Compare");
  const hereLabel = word(labels.label_here, "Compare products here");
  const sidebarTitle = word(labels.sidebar_title, "");

  return (
    <div className="mt-4 flex flex-col items-center gap-2" data-testid="product-compare">
      {inList ? (
        viewLabel && (
          <Link
            href={COMPARE_PATH}
            className="text-sm text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
            data-testid="view-compare"
          >
            {viewLabel}
          </Link>
        )
      ) : (
        addLabel && (
          <button
            type="button"
            onClick={() => add(productId)}
            className="text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline"
            data-testid="add-to-compare"
          >
            {addLabel}
          </button>
        )
      )}
      {hereLabel && (
        <Link
          href={COMPARE_PATH}
          className="rounded-lg border border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition-colors hover:bg-zinc-100"
          data-testid="compare-products-here"
        >
          {hereLabel}
          {list.length > 0 ? ` (${list.length})` : ""}
        </Link>
      )}
      {sidebarTitle && (
        <div className="mt-2 w-full border border-zinc-200 text-sm" data-testid="compare-sidebar">
          <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-semibold text-zinc-900">{sidebarTitle}</div>
          <div className="px-3 py-2 text-zinc-600">
            {list.length === 0 ? (
              word(labels.sidebar_empty, "")
            ) : (
              <Link href={COMPARE_PATH} className="font-medium text-zinc-900 underline underline-offset-2">
                {word(labels.sidebar_compare, "Compare")} ({list.length})
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
