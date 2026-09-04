"use client";
import * as React from "react";
import Link from "next/link";
import BuilderImage from "./builder-image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";
import {
  enquireHandler,
  masterLeafNatives,
  selectItemHandler,
  useAddToCartHandler,
  useAddToQuoteHandler,
} from "./master-leaves";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useFormHandlers, useFormConfirmations } from "./use-form-handlers";
import { categoryNatives } from "./category-natives";

// ============================================================================
// The category page rendered from the 'category_layout' node template — ENGINE.
//
// The route owns ALL the heavy data (faceted listing via the category cache,
// pricing, searchParams paging) and hands it down as `listing`. Authored
// elements bind category.* / listing.total / breadcrumbs from the SHARED
// composeCategoryPagePayload.
//
// Everything in this file is the same on every site: the GST overlay, the
// Actions that drive the interactive MASTERS (toggleFacet / clearFilters /
// setSort), GA4, and the tree render. What differs is only the site's own
// filter rail and grid — supplied under shared KEYS by ./category-natives.
// That is the seam; see docs/architecture/seam-audit.md.
//
// Note on keys: filter-rail, clear-filters, filter-drawer, facet-option and
// filter-controls are component MASTERS (drillable trees driven by the Actions
// below). Natives win over same-key masters, so they must NEVER be registered
// as natives — doing so silently un-explodes an editable section.
// ============================================================================

/** Enough of a listing row for the GA4 view_item_list payload; each site's grid
 *  takes its own richer product type. */
export interface CategoryGridProduct {
  id: number | string;
  sku?: string | null;
  name: string;
  brandName?: string | null;
  price: string;
  salePrice?: string | null;
}

export interface CategoryListingCtx {
  products: CategoryGridProduct[];
  total: number;
  shown: number;
  facets: unknown;
  hasMore: boolean;
  nextPageHref: string;
  memberPricingAvailable: boolean;
  pricing: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  categoryName: string;
  categorySlug: string;
}

export function BuilderCategoryPage({
  tree,
  payload,
  listing,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  /** composeCategoryPagePayload output. */
  payload: object;
  listing: CategoryListingCtx;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Overlay the live GST toggle onto context.gst so the price-block masters in
  // the card grid re-render ex/inc labels the instant the shopper flips it.
  const { inclusive, pricesIncludeTax } = useGst();
  const livePayload = React.useMemo(
    () => overlayLiveGst(payload, inclusive, pricesIncludeTax),
    [payload, inclusive, pricesIncludeTax]
  );

  // App-tier Actions the interactive MASTERS run (facet-option's click →
  // toggleFacet, clear-filters' click → clearFilters). Same URL semantics as
  // the legacy FacetCheckbox/ClearFiltersButton: comma-list params, paging
  // reset, replace without scroll.
  const addToCart = useAddToCartHandler();
  const addToQuote = useAddToQuoteHandler();
  const formHandlers = useFormHandlers();
  // A form success panel shows its form's authored confirmation message when
  // one is set (card XBOxpQmd). Identity-returning when the page carries no
  // form, which is almost every page.
  const confirmed = useFormConfirmations(tree, components);
  const handlers = React.useMemo(
    () => ({
      ...formHandlers,
      addToCart,
      addToQuote,
      enquire: enquireHandler(router),
      toggleFacet: (args: Record<string, unknown>) => {
        const param = String(args.param ?? "");
        const value = String(args.value ?? "");
        if (!param || !value) return { success: false, error: "Missing facet param/value" };
        const next = new URLSearchParams(searchParams.toString());
        const set = new Set(next.get(param)?.split(",").filter(Boolean) ?? []);
        if (set.has(value)) set.delete(value);
        else set.add(value);
        if (set.size > 0) next.set(param, [...set].join(","));
        else next.delete(param);
        next.delete("page"); // filters reset pagination
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        return { success: true };
      },
      // Clears EVERY filter the listing can be narrowed by, not just the three
      // configurable facets: the per-category attribute filters (C8G4f4U8) write
      // `f_<code>` params, and an authored page conditions its Clear all on
      // `listing.hasActiveFilters`, which counts them. Leaving them behind would
      // render a visibly-enabled button that changes nothing at all — the exact
      // "narrows with nothing on screen to clear it" failure NfYe3P3G forbids.
      clearFilters: () => {
        const nextParams = new URLSearchParams(searchParams.toString());
        for (const key of [...nextParams.keys()]) {
          if (key.startsWith("f_")) nextParams.delete(key);
        }
        ["sub", "brand", "price", "stock", "page"].forEach((p) => nextParams.delete(p));
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
        return { success: true };
      },
      // filter-controls master's sort <select> → ?sort= (same as SortSelect).
      setSort: (args: Record<string, unknown>) => {
        const value = String(args.value ?? "");
        const next = new URLSearchParams(searchParams.toString());
        if (value === "relevance") next.delete("sort");
        else next.set("sort", value);
        next.delete("page");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        return { success: true };
      },
      selectItem: selectItemHandler(listing.categorySlug, listing.categoryName),
    }),
    [addToCart, addToQuote, router, pathname, searchParams, listing.categorySlug, listing.categoryName]
  );

  const nativeComponents: NativeComponents = {
    // Sealed leaves the product-card master places:
    ...masterLeafNatives(),
    // The site's own legacy sealed leaves (facet-toggle / filter-rail-mobile /
    // category-listing), kept for trees published before those sections were
    // exploded into masters.
    ...categoryNatives({ listing }),
  };
  return (
    <BuilderActionsProvider handlers={handlers} navigate={(to) => router.push(to)}>
      <Ga4ViewItemList
        listId={listing.categorySlug}
        listName={listing.categoryName}
        items={listing.products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      <BuilderTree
        tree={confirmed.tree}
        payload={livePayload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={confirmed.components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={BuilderImage}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
