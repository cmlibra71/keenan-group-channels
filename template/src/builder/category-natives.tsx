"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { AttributeFacetSections, PriceSliderFacet } from "@/components/category/FilterRail";
import type { CategoryFacets } from "@/components/category/FilterRail";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// The reference site has no LEGACY category listing leaves of its own: every
// section of the category page (filter-rail, filter-drawer, filter-chips,
// sort-select, product-card) is an authored master, and a new site has no trees
// published before that, so registering a stand-in would only shadow a master.
//
// The two keys below are the exception, and they are not legacy. Which
// attributes a category offers is decided from that category's own product data
// (card C8G4f4U8, Steve 2026-08-05: the site auto-assigns them), so an author
// cannot place a section per attribute per category.
// `builder/category-facet-injection.ts` places both leaves inside the AUTHORED
// rail at render time — after the last authored facet group, and in place of
// the Price group's three legacy band tick boxes — and they draw whatever this
// listing earned. Neither key is a master, so nothing is shadowed.
export function categoryNatives({ listing }: { listing: CategoryListingCtx }): NativeComponents {
  return {
    // `CategoryFacets`, not `as never`: `CategoryListingCtx.facets` is
    // `unknown`, so `as never` would satisfy any prop shape at all and hide a
    // future mismatch at this seam instead of failing the typecheck.
    "category-attribute-facets": () => (
      <AttributeFacetSections facets={listing.facets as CategoryFacets} />
    ),
    "facet-price-slider": () => <PriceSliderFacet facets={listing.facets as CategoryFacets} />,
  };
}
