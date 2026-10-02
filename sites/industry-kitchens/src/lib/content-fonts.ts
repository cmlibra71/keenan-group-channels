import { contentFontTokenVars, type DesignTokenSet } from "@keenan/services";

// ============================================================================
// Content-page fonts — the self-hosted families behind `contentFonts` design
// tokens (Industry Kitchens' legacy info-page body fonts).
//
// The token VALUES are data (portal → Design → "Content-page fonts"); they are
// compiled into the builder stylesheet's node-scoped theme, so a
// `font-content-body` class only resolves inside a node region. The FILES are
// the site's own (public/fonts/content/, Fontsource 5.2.8 — byte-identical to
// what the old site served), declared in one stylesheet that is linked only on
// a Site Builder content page of a channel that defines at least one content
// font token. No tokens → no link → the page renders exactly as before; other
// page types never link it.
// ============================================================================

export const CONTENT_FONTS_HREF = "/fonts/content/content-fonts.css";

/** True when the channel's token set defines any content-page font. */
export function hasContentFonts(tokens: DesignTokenSet | null | undefined): boolean {
  return Object.keys(contentFontTokenVars(tokens)).length > 0;
}
