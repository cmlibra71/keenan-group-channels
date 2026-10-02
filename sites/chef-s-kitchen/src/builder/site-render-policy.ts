import type { FormPolicy } from "@keenan/services/builder-react";

// ============================================================================
// This site's rendering choices for Site Builder trees — the PER-SITE half of a
// seam (deliberately NOT a shared module): the shared Builder*Page wrappers read
// it, and each site decides. A choice left out renders exactly as before.
//
// formPolicy.keepEmptyOptionValue — a "Choose…" placeholder <option value="">
//   keeps its empty value, so a required dropdown rejects the placeholder
//   instead of accepting (and submitting) its text. (WP2-b, IK info pages;
//   Chefs Depot switched on 2026-10-03 — "CD select fix", coordinator-approved)
// ============================================================================

export const siteRenderPolicy: { formPolicy: FormPolicy } = {
  formPolicy: { keepEmptyOptionValue: true },
};
