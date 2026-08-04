"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// The site's sealed leaves for CONTENT pages, keyed by the name a node tree
// references. This is the per-site half of the seam: BuilderContentPage is
// identical everywhere, this file is not.
//
// A key with no entry renders nothing rather than throwing, so a tree copied
// from another site degrades quietly instead of breaking the page.
// ============================================================================

export function contentNatives(): NativeComponents {
  return {};
}
