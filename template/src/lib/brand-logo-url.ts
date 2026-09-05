import { isAllowedImageUrl } from "./image-origin";

// ============================================================================
// Card tSrCcnvx — the pure half of the brand-logo image fallback.
//
// Kept apart from `brand-logo-fallback.ts` ON PURPOSE: that file opens a
// commerce DB client, and this predicate is needed inside "use client" modules
// (`product-natives.tsx`, the listing tiles). Importing the services barrel from
// a client module drags server code into the browser bundle and breaks the
// build, so the rule that both halves share lives here with no server imports.
// ============================================================================

/**
 * True only for a brand logo URL our own image proxy will actually serve.
 *
 * `/api/image` 403s anything outside our allowlisted buckets, and a 403 renders
 * as the browser's broken-image glyph — worse than the grey box being replaced.
 * So a logo the proxy would refuse is treated here as no logo at all, and the
 * caller keeps the grey box. Empty strings and nulls come back null too.
 */
export function usableBrandLogo(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isAllowedImageUrl(trimmed) ? trimmed : null;
}
