import type { FormPolicy } from "@keenan/services/builder-react";
import type { EmbedPolicy } from "@keenan/services/cms";
import type { BuilderCssOptions } from "@keenan/services/builder";

// ============================================================================
// This site's rendering choices for Site Builder trees — the PER-SITE half of a
// seam (deliberately NOT a shared module): the shared Builder*Page wrappers read
// it, and each site decides. A choice left out renders exactly as before.
//
// formPolicy.keepEmptyOptionValue — a "Choose…" placeholder <option value="">
//   keeps its empty value, so a required dropdown rejects the placeholder
//   instead of accepting (and submitting) its text. formPolicy.scopeFieldIds —
//   field ids inside each form/instance get a unique prefix (WP2-q). (WP2-b, IK info pages)
// onlyUsedFunctions — a node page is handed only the cms_functions its tree and
//   the masters it draws can call (WP2-h); a page calling none loads no
//   QuickJS sandbox, server or browser. Without it every enabled function rides
//   along on every page.
// builderCss.commaSafeSelectors — the draft-preview compile splits selector
//   lists on top-level commas only, as the portal's publish does for this
//   channel (WP2-j; mirrors the portal's lib/cms/site-render-policy.ts).
// embedPolicy.canva — Canva published-design viewer frames (WP2-c).
// embedPolicy.calculator — node-tree iframes may frame the two exact SilverChef
//   pages (WP2-m; mirrors the portal's lib/cms/site-render-policy.ts).
// contentNow — content pages carry context.now (WP2-s).
// responsiveDetails — FAQ <details data-open-base="open|"> take their phone
//   open state below 1024px without overriding a visitor's click (WP2-n).
// ============================================================================

export const siteRenderPolicy: {
  formPolicy: FormPolicy;
  /** Ship only the library functions a page can call (none → no QuickJS sandbox). */
  onlyUsedFunctions?: boolean;
  /** Builder stylesheet compile choices — must match the portal's for this channel. */
  builderCss?: BuilderCssOptions;
  /** Optional embeds node trees may frame (SilverChef calculator / certified-used page). */
  embedPolicy?: EmbedPolicy;
  /** Content pages carry context.now (today's date, storefront timezone). */
  contentNow?: boolean;
  /** Accordion <details> carrying data-open-base apply it below 1024px. */
  responsiveDetails?: boolean;
  /** Authored carousels (data-kg-carousel) get arrows, dots, keyboard, autoplay (WP3 K1). */
  carousels?: boolean;
  /** Content pages emit canonical + Open Graph and the page's JSON-LD (cms_pages.seo). */
  pageSeo?: boolean;
} = {
  formPolicy: { keepEmptyOptionValue: true, scopeFieldIds: true },
  onlyUsedFunctions: true,
  builderCss: { commaSafeSelectors: true },
  embedPolicy: { calculator: true, canva: true },
  contentNow: true,
  responsiveDetails: true,
  pageSeo: true,
  carousels: true,
};
