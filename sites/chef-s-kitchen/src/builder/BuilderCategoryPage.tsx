"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { FilterRail, FilterChips, SortSelect, FacetCheckbox, MobileFilterRail } from "@/components/category/FilterRail";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";
import { masterLeafNatives, selectItemHandler } from "./master-leaves";

// ============================================================================
// The category page rendered from the 'category_layout' node template. The
// route owns ALL the heavy data (faceted listing via the category cache,
// pricing, searchParams paging) — identical queries to the native page — and
// the sealed "category-listing" native closes over it: filter rail + toolbar
// + grid + load-more, exactly the interactive unit the legacy page renders.
// Authored elements bind category.* / listing.total / breadcrumbs from the
// SHARED composeCategoryPagePayload.
// ============================================================================

export interface CategoryListingCtx {
  products: GridProduct[];
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

  // App-tier Actions the interactive MASTERS run (facet-option's click →
  // toggleFacet, clear-filters' click → clearFilters). Same URL semantics as
  // the legacy FacetCheckbox/ClearFiltersButton: comma-list params, paging
  // reset, replace without scroll.
  const handlers = React.useMemo(
    () => ({
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
      clearFilters: () => {
        const next = new URLSearchParams(searchParams.toString());
        ["sub", "brand", "price", "stock", "page"].forEach((p) => next.delete(p));
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        return { success: true };
      },
      selectItem: selectItemHandler(listing.categorySlug, listing.categoryName),
    }),
    [router, pathname, searchParams, listing.categorySlug, listing.categoryName]
  );

  const nativeComponents: NativeComponents = {
    // Sealed leaves the product-card master places:
    ...masterLeafNatives(listing.pricing),
    // filter-rail / clear-filters / filter-drawer / facet-option are component
    // MASTERS (drillable trees driven by the Actions above) — natives win over
    // same-key masters, so they must NOT be registered here.
    // Legacy sealed leaves kept for older published trees only:
    "facet-toggle": (props: Record<string, unknown>) => (
      <FacetCheckbox
        param={String(props.param ?? "")}
        value={String(props.value ?? "")}
        label={String(props.label ?? "")}
        count={Number(props.count ?? 0)}
      />
    ),
    "filter-rail-mobile": () => <MobileFilterRail facets={listing.facets as never} />,
    "filter-controls": () => (
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips facets={listing.facets as never} />
        <SortSelect />
      </div>
    ),
    // Legacy whole-listing native (early trees) — kept for compatibility.
    "category-listing": () => (
      <div className="flex gap-6">
        <FilterRail facets={listing.facets as never} />
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-white px-4 py-[11px] shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-text-secondary">
                Showing <b className="text-text-primary">1–{listing.shown}</b> of{" "}
                <b className="text-text-primary">{listing.total}</b>
              </p>
              <FilterChips facets={listing.facets as never} />
            </div>
            <SortSelect />
          </div>
          <ProductGridClient
            products={listing.products}
            memberPricingAvailable={listing.memberPricingAvailable}
            {...listing.pricing}
            eyebrow={listing.categoryName}
            narrow
            listId={listing.categorySlug}
            listName={listing.categoryName}
          />
          {listing.hasMore && (
            <div className="mt-10 text-center">
              <Link href={listing.nextPageHref} scroll={false} className="btn-secondary">
                Load more ({listing.total - listing.shown} remaining)
              </Link>
            </div>
          )}
        </div>
      </div>
    ),
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
        tree={tree}
        payload={payload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={Image as unknown as React.ComponentType<Record<string, unknown>>}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
