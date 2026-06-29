/**
 * Allowlist of origins our image pipeline is permitted to fetch from. Image
 * URLs that reach server-side fetches come from the commerce DB, so they must
 * be treated as untrusted (SSRF guard): only https URLs whose hostname is one
 * of our own S3 buckets are allowed.
 */
export const ALLOWED_IMAGE_ORIGINS = [
  "keenan-group-images.s3.ap-southeast-2.amazonaws.com",
  "keenan-portal-assets.s3.ap-southeast-2.amazonaws.com",
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
