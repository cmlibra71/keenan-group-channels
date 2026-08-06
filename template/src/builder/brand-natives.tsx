"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// The site's sealed leaves for the brand template, keyed by the name a node
// tree references. BuilderBrandPage is identical everywhere; this file is not.
//
// An unregistered key renders nothing rather than throwing, so a tree copied
// between sites degrades quietly instead of breaking the page.
export function brandNatives(_args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
  /** Passed by the shared wrapper; this site does not use it. */
  brandSlug?: string;
  brandName?: string;
}): NativeComponents {
  return {};
}
