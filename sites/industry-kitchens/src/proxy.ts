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
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-cms-render", "1");

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const portalOrigin = process.env.PORTAL_ORIGIN || "https://keenan-group.com.au";
  res.headers.set(
    "Content-Security-Policy",
    `frame-ancestors 'self' ${portalOrigin} http://localhost:3000`
  );
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/render/:path*"] };
