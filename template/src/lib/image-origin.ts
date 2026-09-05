/**
 * Allowlist of origins our image pipeline is permitted to fetch from. Image
 * URLs that reach server-side fetches come from the commerce DB, so they must
 * be treated as untrusted (SSRF guard).
 *
 * Two of these buckets are OURS and are allowed wholesale. The third is not
 * ours — it is Zoey's shared, multi-tenant Magento media bucket, where our
 * objects sit under one fixed site-id prefix and other Zoey tenants sit under
 * theirs — so it is allowed only UNDER that prefix. An entry without a
 * `pathPrefix` trusts the whole bucket; never add one for a bucket we do not
 * own.
 */
export type AllowedImageOrigin = {
  /** Bucket hostname, virtual-hosted form, so the BUCKET is pinned in the host. */
  host: string;
  /**
   * When set, the URL's pathname must start with this. Required for any bucket
   * we do not own: `/api/image` is a public unauthenticated GET that fetches
   * the URL, transcodes it and PUTs the result into our own cache bucket with
   * immutable headers, so a host-only entry on a shared bucket would let anyone
   * launder any object in it through our domain.
   */
  pathPrefix?: string;
};

/** Zoey's media root for our site. Kept in step with `ZOEY_VARIANT_MEDIA_BASE` in @keenan/services. */
const ZOEY_MEDIA_PREFIX = "/sites/a0i0L00000VH4TSQA1/media/catalog/product/";

export const ALLOWED_IMAGE_ORIGINS: AllowedImageOrigin[] = [
  { host: "keenan-group-images.s3.ap-southeast-2.amazonaws.com" },
  { host: "keenan-portal-assets.s3.ap-southeast-2.amazonaws.com" },
  // Card 0CDcCYmO — Zoey's Magento media bucket, which still holds the per-variation photographs.
  // The 2024 import copied the media PATH into `product_variants.image_url` rather than the file,
  // so this is where those 1,480 images actually live; `resolveVariantImageUrl` in
  // `@keenan/services` is the only thing that builds a URL here, and it always builds it under
  // the prefix pinned below.
  //
  // `zcom-media` is Zoey's SHARED bucket — other Zoey tenants' media sits in it under their own
  // site ids — so unlike the two above it is NOT allowed wholesale. Both halves matter: the BUCKET
  // is pinned in the hostname (virtual-hosted form, never the bare path-style `s3.amazonaws.com`
  // that every public bucket shares) and the PATH is pinned to our own site's product-media root.
  // Each file is fetched once and then served from our OWN cache bucket forever, so this is a
  // one-time read per image, not a live dependency on a running Zoey. Retiring it means
  // re-hosting those files and rewriting the rows — an owner-gated prod backfill.
  { host: "zcom-media.s3.amazonaws.com", pathPrefix: ZOEY_MEDIA_PREFIX },
];

/**
 * The site's own public origin, from `SITE_URL` (set per site by the deploy, and in
 * docker-compose for local work). SERVER ONLY — `SITE_URL` is not a `NEXT_PUBLIC_` var, so it
 * is undefined in the browser. That is deliberate: `isAllowedImageUrl` below is imported by
 * client components (`CategoryTiles`, `brand-logo-url`) and must answer the same on both sides
 * of hydration, so the own-origin rule lives in its own predicate that only `/api/image` uses.
 */
function ownSiteOrigin(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * A file this site itself serves — the one address the allow-list above could never cover,
 * because it is not a bucket.
 *
 * Card HPgTV0Ck: Steve put `https://chefsdepot.com.au/silverchef-logo.png` on a CMS page. The
 * file is real (it is `public/silverchef-logo.png`, 200 direct) but `/api/image` answered 403,
 * so the authored image drew nothing. Anything under `public/` is on our own origin, already
 * public to anyone, and reachable by us — there is no SSRF question to answer about it.
 *
 * Two limits keep it that narrow:
 *  - the origin must match `SITE_URL` EXACTLY (scheme, host and port), so it is our own site
 *    and not a lookalike, and an unset `SITE_URL` allows nothing;
 *  - `/api/**` is refused, because `/api/image` fetching `/api/image` is an unbounded
 *    self-recursion and a cost-amplification lever, which is the whole reason this route
 *    snaps width and quality to a fixed set.
 * `www.` is NOT covered: a storefront serves one canonical origin and that is the one to author.
 */
export function isOwnSiteImageUrl(url: string): boolean {
  const own = ownSiteOrigin();
  if (!own) return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== own) return false;
    // `URL` has already normalised `..`, `.` and percent-encoded separators out of `pathname`.
    if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * What `/api/image` is permitted to go and fetch: an allowlisted BUCKET, or a file this site
 * serves itself. Kept apart from `isAllowedImageUrl` on purpose — that one is the "is this
 * picture usable?" test the category tiles and the brand-logo fallback run in the BROWSER, and
 * it must stay a pure function of the URL. (Cards LrRNJiEY, gRLRF8yu, 0CDcCYmO, HPgTV0Ck.)
 */
export function isFetchableImageUrl(url: string): boolean {
  return isAllowedImageUrl(url) || isOwnSiteImageUrl(url);
}

/**
 * True only for https URLs served from an allowlisted bucket hostname — and, where that entry
 * carries a `pathPrefix`, only under that prefix.
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const origin = ALLOWED_IMAGE_ORIGINS.find((o) => o.host === parsed.hostname);
    if (!origin) return false;
    // `URL` has already normalised `..`, `.` and percent-encoded separators out of `pathname`,
    // so a prefix test here cannot be walked around.
    if (origin.pathPrefix && !parsed.pathname.startsWith(origin.pathPrefix)) return false;
    return true;
  } catch {
    return false;
  }
}
