/**
 * Allowlist of origins our image pipeline is permitted to fetch from. Image
 * URLs that reach server-side fetches come from the commerce DB, so they must
 * be treated as untrusted (SSRF guard): only https URLs whose hostname is one
 * of our own S3 buckets are allowed.
 */
export const ALLOWED_IMAGE_ORIGINS = [
  "keenan-group-images.s3.ap-southeast-2.amazonaws.com",
  "keenan-portal-assets.s3.ap-southeast-2.amazonaws.com",
  // Card 0CDcCYmO — Zoey's Magento media bucket, which still holds the per-variation photographs.
  // The 2024 import copied the media PATH into `product_variants.image_url` rather than the file,
  // so this is where those 1,480 images actually live; `resolveVariantImageUrl` in
  // `@keenan/services` is the only thing that builds a URL here, always under the fixed
  // `sites/a0i0L00000VH4TSQA1/media/catalog/product/` prefix. The BUCKET is pinned in the
  // hostname (virtual-hosted form), so this allows exactly one bucket, not all of S3 — never
  // widen it to the bare `s3.amazonaws.com` path-style host, which every public bucket shares.
  // Each file is fetched once and then served from our OWN cache bucket forever, so this is a
  // one-time read per image, not a live dependency on a running Zoey. Retiring it means
  // re-hosting those files and rewriting the rows — an owner-gated prod backfill.
  "zcom-media.s3.amazonaws.com",
];

/** True only for https URLs served from an allowlisted bucket hostname. */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_ORIGINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
