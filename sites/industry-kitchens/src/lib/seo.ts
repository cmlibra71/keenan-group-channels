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
  // No cross-brand default. This file is shared by every channel, so a hardcoded
  // fallback domain means one storefront silently emits ANOTHER brand's canonical
  // and OG urls whenever SITE_URL is missing. localhost is obviously wrong in
  // production, which is the point: it shows up instead of hiding.
  const raw =
    process.env.SITE_URL ||
    siteUrl ||
    (process.env.NEXT_PUBLIC_SITE_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_SITE_DOMAIN}`
      : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

/**
 * The `robots` half of a category page's metadata.
 *
 * A category carrying `include_in_search = false` is deliberately kept out of
 * search: it is already dropped from the mega menu, `/categories`, the home
 * blocks and the sitemap (`listVisibleSlim`). Its page still SERVES — staff and
 * old links reach it, and the Chefs Depot "Services & Non-Merchandise"
 * department needs its freight/installation/warranty SKUs to stay categorised
 * and buyable — so the only thing left to say is "do not index this address".
 * Steve's taxonomy CSV states it outright: Index Recommendation = NOINDEX.
 *
 * Returns undefined for an ordinary category so the site-wide default (robots.ts
 * plus SITE_INDEXABLE) keeps deciding, and nothing changes for the other 110
 * category pages.
 */
export function categoryRobots(
  category: { include_in_search?: boolean | null } | null | undefined
): { index: false; follow: true } | undefined {
  // follow: true — the products inside are indexable on their own URLs, and
  // this page is one of the routes that links to them.
  return category?.include_in_search === false ? { index: false, follow: true } : undefined;
}
