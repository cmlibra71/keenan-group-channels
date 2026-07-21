import { NextRequest, NextResponse } from "next/server";

/**
 * Scoped to /render/* ONLY (see matcher) — live storefront routes never pass
 * through here, so this cannot affect production pages.
 *
 * The chrome-free CMS render surface: tags the request so the root layout
 * skips Header/Footer/analytics (bare shell), locks framing to the portal
 * (the pages are embedded in the portal's page-builder / component-library
 * iframes), and keeps the surface out of search indexes.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── /json/* — the parallel JSON preview surface ────────────────────────────
  // Renders the DRAFT node-tree version of any page beside its live HTML
  // counterpart (e.g. /json/categories/x mirrors /categories/x), so the JSON
  // build can be reviewed side-by-side WITHOUT publishing or flipping the
  // node_* flags. Rewrites to the real route and tags the request; each surface
  // route treats `x-kg-json` like draft mode (force node branch + draft tree).
  if (pathname === "/json" || pathname.startsWith("/json/")) {
    const target = pathname === "/json" ? "/" : pathname.slice("/json".length);
    const url = req.nextUrl.clone();
    url.pathname = target;
    const jsonHeaders = new Headers(req.headers);
    jsonHeaders.set("x-kg-json", "1");
    const jsonRes = NextResponse.rewrite(url, { request: { headers: jsonHeaders } });
    jsonRes.headers.set("X-Robots-Tag", "noindex, nofollow");
    return jsonRes;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-cms-render", "1");

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const portalOrigin = process.env.PORTAL_ORIGIN || "https://keenan-group.com.au";
  // Allow any localhost port in dev (the portal can run on 3000/3210/…); prod
  // is locked to PORTAL_ORIGIN. localhost:* is dev-only-reachable, so safe.
  res.headers.set(
    "Content-Security-Policy",
    `frame-ancestors 'self' ${portalOrigin} http://localhost:*`
  );
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/render/:path*", "/json", "/json/:path*"] };
