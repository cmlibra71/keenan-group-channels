"use client";
import Link from "next/link";
import type { NativeComponents } from "@keenan/services/builder-react";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// Industry Kitchens' sealed leaf for the category template — the same KEY as
// Chefs Depot's, its own filter rail and grid, its own look.
//
// Only `category-listing` is registered. Chefs Depot also carries `facet-toggle`
// and `filter-rail-mobile`, which exist purely for trees it published before
// those sections were exploded into masters; IK has no such trees, and no
// FacetCheckbox/MobileFilterRail either. Omitting them is correct — a tree
// authored here should use the masters.
export function categoryNatives({ listing }: { listing: CategoryListingCtx }): NativeComponents {
  return {
    "category-listing": () => (
      <div className="flex gap-6">
        <FilterRail facets={listing.facets as never} />
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-zinc-500">
                Showing <b className="text-zinc-900">1–{listing.shown}</b> of{" "}
                <b className="text-zinc-900">{listing.total}</b>
              </p>
              <FilterChips facets={listing.facets as never} />
            </div>
            <SortSelect />
          </div>
          <ProductGridClient
            products={listing.products as GridProduct[]}
            memberPricingAvailable={listing.memberPricingAvailable}
            {...listing.pricing}
            listId={listing.categorySlug}
            listName={listing.categoryName}
          />
          {listing.hasMore && (
            <div className="mt-10 text-center">
              <Link
                href={listing.nextPageHref}
                scroll={false}
                className="inline-flex items-center rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Load more ({listing.total - listing.shown} remaining)
              </Link>
            </div>
          )}
        </div>
      </div>
    ),
  };
}
