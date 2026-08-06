"use client";
import Link from "next/link";
import type { NativeComponents } from "@keenan/services/builder-react";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// Industry Kitchens' sealed leaf for the category template — the same KEY as
// Chefs Depot's, its own filter rail and grid, its own look.
//
// The markup below is a LINE-FOR-LINE copy of the live listing in
// app/categories/[slug]/page.tsx. That is the whole contract: this native stands
// in for that page, so it has to be pixel-identical or the parity harness fails
// the conversion. The first version of this file was written from CD's shape and
// silently differed — a toolbar wrapped in `rounded-lg border bg-white px-4 py-3`
// the live page does not have, `text-sm text-zinc-500` where live is
// `text-[13px] text-zinc-600`, and a Load-more button missing its border, weight
// and transition classes. Nothing rendered it yet, so nothing caught it.
//
// If the live page changes, this changes with it.
//
// Only `category-listing` is registered. CD also carries `facet-toggle` and
// `filter-rail-mobile` for trees it published before those sections were
// exploded into masters; IK has no such trees and no FacetCheckbox /
// MobileFilterRail to build them from. Omitting them is correct.
export function categoryNatives({ listing }: { listing: CategoryListingCtx }): NativeComponents {
  return {
    "category-listing": () => (
      <div className="flex gap-6">
        <FilterRail facets={listing.facets as never} />

        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-zinc-600">
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

          {/* Load more */}
          {listing.hasMore && (
            <div className="mt-10 text-center">
              <Link
                href={listing.nextPageHref}
                scroll={false}
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
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
