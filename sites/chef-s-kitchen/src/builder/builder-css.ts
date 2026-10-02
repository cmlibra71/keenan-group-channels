import { createHash } from "node:crypto";

// ============================================================================
// The published Site Builder stylesheet (`channel_settings.builder_published_css`)
// as a content-addressed file.
//
// It used to be injected as an inline <style>, which sent it TWICE per page: the
// ~74 KB in the HTML, and the same ~74 KB again as a text row in the RSC payload
// (measured on live Chefs Depot pages, 2026-10-01). Linked by a URL that is the
// hash of its own content, the browser downloads it once and reuses it on every
// page, and a CMS publish (which recompiles the CSS) changes the URL at once, so
// a cached copy can never be served for a newer stylesheet.
// ============================================================================

export const BUILDER_CSS_PATH = "/builder-css";

// One stylesheet per channel, recompiled only on a publish: hashing it once per
// distinct value keeps this off every render.
let memo: { css: string; hash: string } | null = null;

/** The first 16 hex chars of the sha256 of the stylesheet's exact text. */
export function builderCssHash(css: string): string {
  if (memo && memo.css === css) return memo.hash;
  const hash = createHash("sha256").update(css).digest("hex").slice(0, 16);
  memo = { css, hash };
  return hash;
}

/** The address a page links the stylesheet from. */
export function builderCssHref(css: string): string {
  return `${BUILDER_CSS_PATH}/${builderCssHash(css)}.css`;
}

/** The hash a `/builder-css/<file>` request asks for, or null for anything else. */
export function builderCssHashFromFile(file: string): string | null {
  const m = /^([0-9a-f]{16})\.css$/.exec(file);
  return m ? m[1] : null;
}
