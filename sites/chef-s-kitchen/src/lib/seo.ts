// Shared SEO helpers for robots.ts, sitemap.ts and metadata.
//
// Indexability is opt-in per site via SITE_INDEXABLE so a non-production or
// build/mirror channel (e.g. Industry Kitchens) stays out of search engines
// until it is explicitly turned on for a public storefront (Chef's Depot).

export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}

/**
 * Absolute, scheme-qualified site origin with no trailing slash. Prefers the
 * SITE_URL env (set per site in .env), then the channel's configured site URL,
 * then a safe production default.
 */
export function siteBaseUrl(siteUrl?: string | null): string {
  const raw =
    process.env.SITE_URL ||
    siteUrl ||
    `https://${process.env.NEXT_PUBLIC_SITE_DOMAIN || "chefsdepot.com.au"}`;
  return raw.replace(/\/+$/, "");
}
