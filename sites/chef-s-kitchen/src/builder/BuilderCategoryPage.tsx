"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";

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
  const nativeComponents: NativeComponents = {
    // Granular sealed natives (the rich seed uses these; the authored grid of
    // ⬢ product-card instances renders straight from the tree).
    "filter-rail": () => <FilterRail facets={listing.facets as never} />,
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
    <BuilderActionsProvider handlers={{}} navigate={(to) => router.push(to)}>
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
