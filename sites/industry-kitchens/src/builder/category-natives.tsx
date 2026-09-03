"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { AttributeFacetSections, PriceSliderFacet } from "@/components/category/FilterRail";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// Industry Kitchens seals nothing on the category page any more.
//
// `category-listing` — the whole rail + toolbar + grid + load-more — was the
// stand-in while those parts were authored one at a time. They all are now
// (filter-rail, filter-drawer, filter-chips, sort-select, product-card), so the
// registration is dead code, and a dead native is not harmless: natives WIN
// over masters by key, so a future `category-listing` master would be silently
// ignored in favour of this.
//
// The signature stays so the wrapper keeps its seam.
//
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
  };
}
