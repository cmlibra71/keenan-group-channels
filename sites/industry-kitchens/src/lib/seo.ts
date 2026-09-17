// Shared SEO helpers for robots.ts, sitemap.ts and metadata.
//
// Indexability is opt-in per site via SITE_INDEXABLE so a non-production or
// build/mirror channel (e.g. Industry Kitchens) stays out of search engines
// until it is explicitly turned on for a public storefront (Chef's Depot).

export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}

/**
 * The site-wide `robots` metadata — the THIRD thing `SITE_INDEXABLE` governs,
 * alongside `robots.txt` and `sitemap.xml`.
 *
 * It is one switch on purpose. Industry Kitchens carried a hardcoded
 * `robots: { index: false, follow: false }` in its own `app/layout.tsx` instead,
 * which meant the cutover step everyone had in mind — "set SITE_INDEXABLE=true" —
 * would have opened `robots.txt` and published the sitemap while every page went
 * on telling Google `noindex, nofollow` (measured on the live build mirror,
 * card InEoeMZh). A crawlable site nobody may index is the worst of both.
 *
 * Returns undefined — no `<meta name="robots">` at all — once a site is
 * indexable, which is what Chefs Depot serves today and must keep serving.
 */
export function siteRobots(): { index: false; follow: false } | undefined {
  return isIndexable() ? undefined : { index: false, follow: false };
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
 * An ORDINARY category falls back to `siteRobots()` rather than to `undefined`.
 * That is not a nicety: Next resolves metadata field by field, and a page that
 * names `robots` at all — even as undefined — REPLACES the layout's value
 * instead of inheriting it. So the old `undefined` silently cancelled the
 * site-wide noindex on every ordinary category page, which is why Industry
 * Kitchens' category pages carried no `<meta name="robots">` while its brand and
 * content pages carried `noindex, nofollow` (measured, card InEoeMZh). Nothing
 * changes for Chefs Depot, which is indexable, so `siteRobots()` is undefined
 * there and the page emits no robots meta exactly as it does today.
 */
export function categoryRobots(
  category: { include_in_search?: boolean | null } | null | undefined
): { index: false; follow: boolean } | undefined {
  // follow: true — the products inside are indexable on their own URLs, and
  // this page is one of the routes that links to them.
  return category?.include_in_search === false
    ? { index: false, follow: true }
    : siteRobots();
}
