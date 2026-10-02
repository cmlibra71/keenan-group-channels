import type { FormPolicy } from "@keenan/services/builder-react";

// ============================================================================
// This site's rendering choices for Site Builder trees — the PER-SITE half of a
// seam (deliberately NOT a shared module): the shared Builder*Page wrappers read
// it, and each site decides. A choice left out renders exactly as before.
//
// formPolicy.keepEmptyOptionValue — a "Choose…" placeholder <option value="">
//   keeps its empty value, so a required dropdown rejects the placeholder
//   instead of accepting (and submitting) its text. (WP2-b, IK info pages)
// onlyUsedFunctions — a node page is handed only the cms_functions its tree and
//   the masters it draws can call (WP2-h); a page calling none loads no
//   QuickJS sandbox, server or browser. Without it every enabled function rides
//   along on every page.
// ============================================================================

export const siteRenderPolicy: {
  formPolicy: FormPolicy;
  /** Ship only the library functions a page can call (none → no QuickJS sandbox). */
  onlyUsedFunctions?: boolean;
} = {
  formPolicy: { keepEmptyOptionValue: true },
  onlyUsedFunctions: true,
};
