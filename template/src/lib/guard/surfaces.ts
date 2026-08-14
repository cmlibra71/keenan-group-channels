// Path → surface class, and the per-class request budgets.
//
// Pure: no imports at all. This file is bundled into BOTH the middleware bundle
// and the app bundle (see ./store.ts), so it must stay free of framework and
// DB imports.

export type SurfaceClass =
  | "exempt"
  | "page"
  | "listing"
  | "search"
  | "image"
  | "api"
  | "checkout"
  | "sitemap";

export type Limit = {
  /** Short window that catches a burst. */
  burstMs: number;
  burstMax: number;
  /** Long window that catches a patient scraper pacing itself under the burst. */
  windowMs: number;
  max: number;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Both windows must be satisfied. The burst window stops a smash-and-grab; the
 * sustained window stops the patient scraper that paces itself just under it.
 *
 * Sizing notes:
 * - `image` is ~4x `page` because lib/image-loader.ts routes EVERY image through
 *   /api/image, so one product or category page fires 20–40 of them.
 * - `search` is tight because /search fans out into six Meilisearch queries per
 *   request, and falls back to uncached Postgres full-text when Meili is down.
 * - `checkout` is deliberately generous: a false positive there costs a sale,
 *   and those routes are already protected by login-throttle and form limits.
 * - `sitemap` is tight because each hit is a ~40k-row catalogue enumeration.
 */
export const SURFACE_LIMITS: Record<Exclude<SurfaceClass, "exempt">, Limit> = {
  page: { burstMs: 10 * SECOND, burstMax: 30, windowMs: 5 * MINUTE, max: 300 },
  listing: { burstMs: 10 * SECOND, burstMax: 20, windowMs: 5 * MINUTE, max: 150 },
  search: { burstMs: 10 * SECOND, burstMax: 8, windowMs: 5 * MINUTE, max: 50 },
  image: { burstMs: 10 * SECOND, burstMax: 120, windowMs: 5 * MINUTE, max: 1200 },
  api: { burstMs: 10 * SECOND, burstMax: 60, windowMs: 5 * MINUTE, max: 400 },
  checkout: { burstMs: 10 * SECOND, burstMax: 60, windowMs: 5 * MINUTE, max: 600 },
  sitemap: { burstMs: MINUTE, burstMax: 2, windowMs: HOUR, max: 10 },
};

/**
 * Never guarded, for operational reasons rather than generosity:
 * - /api/health is the BLUE-GREEN DEPLOY GATE, polled `?deep=1` from the host.
 *   Guarding it would let a deploy gate itself out.
 * - /api/revalidate is the portal's publish webhook and is already secret-authed.
 * - /api/preview/* and /api/impersonate are cookie/secret-gated admin surfaces.
 * - /api/test/* 404s unless E2E_LOGIN_SECRET is set.
 */
const EXEMPT_EXACT = new Set([
  "/robots.txt",
  "/favicon.ico",
  "/icon",
  "/manifest.webmanifest",
]);

const EXEMPT_PREFIXES = [
  "/api/health",
  "/api/revalidate",
  "/api/impersonate",
  "/api/preview",
  "/api/test",
  "/icon",
];

const LISTING_PREFIXES = ["/categories", "/brands", "/clearance", "/blog"];

/** Strip the trailing slash so "/search/" cannot dodge the search budget. */
function canonical(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function classifySurface(pathname: string): SurfaceClass {
  const path = canonical(pathname);

  if (EXEMPT_EXACT.has(path)) return "exempt";
  for (const prefix of EXEMPT_PREFIXES) {
    // Segment-wise so "/api/healthz-probe" cannot inherit the exemption.
    if (startsWithSegment(path, prefix)) return "exempt";
  }

  if (path === "/sitemap.xml") return "sitemap";

  // Order matters: the image and search API paths are checked before the
  // generic /api catch-all.
  if (startsWithSegment(path, "/api/image") || startsWithSegment(path, "/api/hero-atlas")) {
    return "image";
  }
  if (path === "/api/search" || path === "/search") return "search";
  if (path.startsWith("/api/")) return "api";

  if (
    startsWithSegment(path, "/checkout") ||
    startsWithSegment(path, "/cart") ||
    startsWithSegment(path, "/account") ||
    startsWithSegment(path, "/membership")
  ) {
    return "checkout";
  }

  // The catalogue listing surfaces — the primary scraping targets. Note
  // /products (index) is a listing but /products/<slug> is a detail page, which
  // gets the higher `page` budget because real browsing walks many of them.
  if (path === "/products") return "listing";
  for (const prefix of LISTING_PREFIXES) {
    if (startsWithSegment(path, prefix)) return "listing";
  }

  return "page";
}

/**
 * The budget a SERVER ACTION posted to `pathname` is charged against.
 *
 * Actions POST to ordinary page paths (checkout fires several), so charging them
 * to the PAGE budget would have a single checkout look like several page views —
 * hence the generic `api` class.
 *
 * `/search` is the one exception, and it is a security bound rather than a
 * nicety: the `search` budget is deliberately the tightest on the site because a
 * /search render fans out into six Meilisearch queries and falls back to
 * uncached Postgres, and the search feed's load-more action does that same work.
 * Letting it inherit `api` (60/burst, 400 per 5 min against search's 8 and 50)
 * would open a second, eight-times-cheaper door onto exactly the catalogue
 * enumeration the tight budget exists to stop.
 */
export function classifyActionSurface(pathname: string): SurfaceClass {
  const surface = classifySurface(pathname);
  if (surface === "exempt" || surface === "search") return surface;
  return "api";
}
