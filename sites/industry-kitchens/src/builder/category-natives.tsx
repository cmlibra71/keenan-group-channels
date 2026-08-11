"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
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
export function categoryNatives(_args: { listing: CategoryListingCtx }): NativeComponents {
  void _args;
  return {};
}
