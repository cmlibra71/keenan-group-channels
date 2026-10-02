"use client";
import * as React from "react";
import Link from "next/link";
import BuilderImage from "./builder-image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { siteRenderPolicy } from "./site-render-policy";
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
import { ListingNavProvider, useListingNav } from "@/lib/listing-nav";
import { overlayPendingFilters, toggleListParam } from "@/lib/listing-pending";

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

type BuilderCategoryPageProps = {
  tree: NodeTree;
  /** composeCategoryPagePayload output. */
  payload: object;
  listing: CategoryListingCtx;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
};

/** One listing navigation for the whole page: the authored tick boxes, the
 *  sealed slider and the grid's loaders all read the same pending change
 *  (see lib/listing-nav.tsx). */
export function BuilderCategoryPage(props: BuilderCategoryPageProps) {
  return (
    <ListingNavProvider>
      <CategoryPageTree {...props} />
    </ListingNavProvider>
  );
}

function CategoryPageTree({
  tree,
  payload,
  listing,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: BuilderCategoryPageProps) {
  const router = useRouter();
  const nav = useListingNav();
  const searchParams = nav.params;
  // Overlay the live GST toggle onto context.gst so the price-block masters in
  // the card grid re-render ex/inc labels the instant the shopper flips it.
  const { inclusive, pricesIncludeTax } = useGst();
  // While a filter change loads, the authored tick boxes, sort select and
  // Clear all read the address the shopper just asked for, not the old one.
  const livePayload = React.useMemo(() => {
    const gst = overlayLiveGst(payload, inclusive, pricesIncludeTax);
    return nav.pending ? overlayPendingFilters(gst, nav.params) : gst;
  }, [payload, inclusive, pricesIncludeTax, nav.pending, nav.params]);

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
        nav.replace(toggleListParam(searchParams, param, value));
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
        nav.replace(nextParams);
        return { success: true };
      },
      // filter-controls master's sort <select> → ?sort= (same as SortSelect).
      //
      // The choice is ALWAYS written to the URL, including "relevance". This
      // page does not know the storefront's own default order (card InEoeMZh)
      // and the payload's `listing.sort` already carries the EFFECTIVE one, so
      // dropping the parameter for "relevance" would send a shopper on a
      // price-ordered storefront straight back to the price order — a control
      // that visibly does nothing. An explicit `?sort=relevance` is read as
      // relevance by every listing route.
      setSort: (args: Record<string, unknown>) => {
        const value = String(args.value ?? "");
        const next = new URLSearchParams(searchParams.toString());
        if (value) next.set("sort", value);
        else next.delete("sort");
        next.delete("page");
        nav.replace(next);
        return { success: true };
      },
      selectItem: selectItemHandler(listing.categorySlug, listing.categoryName),
    }),
    [addToCart, addToQuote, router, nav, searchParams, listing.categorySlug, listing.categoryName]
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
        formPolicy={siteRenderPolicy.formPolicy}
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
