"use client";

// ============================================================================
// "Add to Compare" on the Industry Kitchens product page (IK parity plan
// decision 12, root cause `compare-feature` — 58 audits saw it on the old site).
//
// The old page (www.industrykitchens.com.au, 2026-09-28) carried, directly under
// ADD TO BASKET, a small "Add to Compare" link that added the product to the
// visitor's compare list and then read "View Compare", and then ONE of two blocks,
// decided by the product's Zoey layout:
//   * the "COMPARE PRODUCTS HERE" button to the compare page (763 layouts), or
//   * Zoey's sidebar widget, "Compare Products" / "You have no items to compare."
//     (Zoey's default page and 3 layouts — layout flag `compareSidebar`, round 4).
// The list is the visitor's cookie (`lib/compare/compare-list.ts`) — nothing is
// written to the database.
//
// Every word is a node prop on the template's compare node (unset = the words
// below, which are the old site's). SEALED native (`product-compare`, registered in
// `builder/product-natives.tsx`) because it carries client state of its own — which
// products are in the list — that an authored tree cannot hold. It is placed on the
// live page by the `withCompareNode` pass; an author may place it themselves in the
// product template (with its words), and the pass then leaves that placement alone.
// ============================================================================

import Link from "next/link";
import { useProductPurchaseOptional } from "@keenan/services/product-page";
import { useCompareList } from "@/lib/compare/use-compare-list";
import { COMPARE_PATH } from "@/lib/compare/compare-path";

export interface AddToCompareLabels {
  add?: string | null;
  view?: string | null;
  compareHere?: string | null;
  sidebarHeading?: string | null;
  sidebarEmpty?: string | null;
  /** The widget's line once the list holds products; `{n}` is replaced by how many. */
  sidebarSome?: string | null;
}

const DEFAULTS = {
  add: "Add to Compare",
  view: "View Compare",
  compareHere: "Compare products here",
  sidebarHeading: "Compare Products",
  sidebarEmpty: "You have no items to compare.",
  sidebarSome: "Compare {n} item(s)",
} as const;

export function AddToCompare({
  productId: explicitId,
  sidebar = false,
  labels,
}: {
  productId?: number;
  /** Zoey's sidebar widget instead of the COMPARE PRODUCTS HERE button (layout `compareSidebar`). */
  sidebar?: boolean;
  labels?: AddToCompareLabels;
}) {
  const purchase = useProductPurchaseOptional();
  const productId = explicitId ?? Number(purchase?.product?.id);
  const { list, add, has } = useCompareList();
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const inList = has(productId);
  const w = (k: keyof typeof DEFAULTS) => (typeof labels?.[k] === "string" ? (labels[k] as string) : DEFAULTS[k]);

  return (
    <div className="mt-4 flex flex-col items-center gap-2" data-testid="product-compare">
      {inList ? (
        w("view") ? (
          <Link
            href={COMPARE_PATH}
            className="text-sm text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
            data-testid="view-compare"
          >
            {w("view")}
          </Link>
        ) : null
      ) : w("add") ? (
        <button
          type="button"
          onClick={() => add(productId)}
          className="text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline"
          data-testid="add-to-compare"
        >
          {w("add")}
        </button>
      ) : null}
      {sidebar ? (
        <div className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-left" data-testid="compare-sidebar">
          {w("sidebarHeading") ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-900">{w("sidebarHeading")}</p>
          ) : null}
          {list.length > 0 ? (
            <Link href={COMPARE_PATH} className="mt-1 block text-sm text-zinc-700 underline underline-offset-2 hover:text-zinc-900">
              {w("sidebarSome").replace("{n}", String(list.length))}
            </Link>
          ) : w("sidebarEmpty") ? (
            <p className="mt-1 text-sm text-zinc-600">{w("sidebarEmpty")}</p>
          ) : null}
        </div>
      ) : w("compareHere") ? (
        <Link
          href={COMPARE_PATH}
          className="rounded-lg border border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition-colors hover:bg-zinc-100"
          data-testid="compare-products-here"
        >
          {w("compareHere")}
          {list.length > 0 ? ` (${list.length})` : ""}
        </Link>
      ) : null}
    </div>
  );
}
