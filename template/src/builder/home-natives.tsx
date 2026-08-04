"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// The reference site's homepage sections — none, deliberately.
//
// Every key a site registers here is one of ITS OWN sealed sections (hero,
// trust bar, category tiles, brand showcase, clearance, featured, FAQ…). They
// are pure visual identity, which is precisely what must not be shared between
// sites, so the template registers nothing and a new site starts by writing its
// own.
//
// `HomeNativeData` is per-site for the same reason: it describes what THIS
// site's sections need prefetched. The engine wrapper only passes it through.
// ============================================================================

export interface HomeNativeData {
  [key: string]: unknown;
}

export function homeSectionNatives(_home: HomeNativeData): NativeComponents {
  void _home;
  return {};
}
