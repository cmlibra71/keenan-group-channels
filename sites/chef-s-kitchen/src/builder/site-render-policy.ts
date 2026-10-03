import type { FormPolicy } from "@keenan/services/builder-react";
import type { BuilderCssOptions } from "@keenan/services/builder";

// ============================================================================
// This site's rendering choices for Site Builder trees — the PER-SITE half of a
// seam (deliberately NOT a shared module): the shared Builder*Page wrappers read
// it, and each site decides. A choice left out renders exactly as before.
//
// formPolicy.keepEmptyOptionValue — a "Choose…" placeholder <option value="">
//   keeps its empty value, so a required dropdown rejects the placeholder
//   instead of accepting (and submitting) its text. (WP2-b, IK info pages;
//   Chefs Depot switched on 2026-10-03 — "CD select fix", coordinator-approved)
// onlyUsedFunctions — a node page is handed only the cms_functions its tree and
//   the masters it draws can call (WP2-h); a page calling none loads no
//   QuickJS sandbox, server or browser. Without it every enabled function rides
//   along on every page.
// builderCss.commaSafeSelectors — the draft-preview compile splits selector
//   lists on top-level commas only, as the portal's publish does for this
//   channel (WP2-j; mirrors the portal's lib/cms/site-render-policy.ts).
// ============================================================================

export const siteRenderPolicy: {
  formPolicy: FormPolicy;
  /** Ship only the library functions a page can call (none → no QuickJS sandbox). */
  onlyUsedFunctions?: boolean;
  /** Builder stylesheet compile choices — must match the portal's for this channel. */
  builderCss?: BuilderCssOptions;
} = {
  formPolicy: { keepEmptyOptionValue: true },
};
