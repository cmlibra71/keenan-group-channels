// Bounding the /api/image cache-key space.
//
// Pure so it can be unit-tested without sharp or S3.

/**
 * The ONLY widths the app ever asks for — `images.imageSizes` +
 * `images.deviceSizes` from next.config.ts. Keep in step with that config.
 */
export const ALLOWED_WIDTHS = [100, 200, 400, 600, 800, 1024, 1280, 1600] as const;

/** The loader hard-codes q=80 and no component overrides it. */
export const ALLOWED_QUALITIES = [60, 75, 80, 90] as const;
export const DEFAULT_QUALITY = 80;

/**
 * Every distinct (width, quality) pair is a fresh `sharp` encode AND a fresh S3
 * PUT. Before this, `w` was merely clamped to 3840 — so one source image could
 * be made to cost 3,840 encodes and 3,840 stored objects, from a URL anyone
 * could type. Snapping to a fixed set turns that into 8.
 *
 * Snaps UP to the nearest allowed width rather than rejecting: an unexpected
 * width should still render (just slightly larger than asked for), because a
 * broken image on a live storefront is worse than a marginally oversized one.
 */
export function normaliseWidth(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  const max = ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
  if (!Number.isFinite(n) || n <= 0) return 800;
  for (const w of ALLOWED_WIDTHS) {
    if (n <= w) return w;
  }
  return max;
}

export function normaliseQuality(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_QUALITY;
  for (const q of ALLOWED_QUALITIES) {
    if (n <= q) return q;
  }
  return ALLOWED_QUALITIES[ALLOWED_QUALITIES.length - 1];
}
