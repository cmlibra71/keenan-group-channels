"use client";
import Link from "next/link";
import type { NativeComponents } from "@keenan/services/builder-react";
import {
  FilterRail,
  FilterChips,
  SortSelect,
  FacetCheckbox,
  MobileFilterRail,
  AttributeFacetSections,
  PriceSliderFacet,
} from "@/components/category/FilterRail";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// Chefs Depot's sealed leaves for the category template. Lifted verbatim out of
// the wrapper when that became shared engine — behaviour unchanged.
//
// These are all LEGACY: filter-rail, clear-filters, filter-drawer, facet-option
// and filter-controls are component MASTERS now. Natives win over same-key
// masters, so none of those keys may ever be added here.
// The per-category attribute sections and the Price slider (card C8G4f4U8).
// These are NOT legacy: which attributes a category offers is decided from that
// category's own product data, so an author cannot place a section per
// attribute per category. `builder/category-facet-injection.ts` places both
// leaves inside the AUTHORED rail at render time — after the last authored
// facet group, and in place of the Price group's three legacy band tick boxes —
// and they draw whatever this listing earned. Neither key is a master, so
// nothing is shadowed.
export function categoryNatives({ listing }: { listing: CategoryListingCtx }): NativeComponents {
  return {
    "category-attribute-facets": () => (
      <AttributeFacetSections facets={listing.facets as never} />
    ),
    "facet-price-slider": () => <PriceSliderFacet facets={listing.facets as never} />,
    "facet-toggle": (props: Record<string, unknown>) => (
      <FacetCheckbox
        param={String(props.param ?? "")}
        value={String(props.value ?? "")}
        label={String(props.label ?? "")}
        count={Number(props.count ?? 0)}
      />
    ),
    "filter-rail-mobile": () => <MobileFilterRail facets={listing.facets as never} />,
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
            products={listing.products as GridProduct[]}
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
}
