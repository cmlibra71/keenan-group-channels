"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import type { CategoryListingCtx } from "./BuilderCategoryPage";

// The reference site has no category listing components of its own, so it
// registers nothing. Every key here is a LEGACY sealed leaf kept for trees
// published before those sections were exploded into masters — a new site has
// no such trees, so an empty map is correct rather than a gap.
export function categoryNatives(_args: { listing: CategoryListingCtx }): NativeComponents {
  void _args;
  return {};
}
