import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import {
  ACQUISITION_COOKIE,
  ACQUISITION_MAX_AGE,
  acquisitionBagFromRequest,
  // IMPORT DISCIPLINE: the PURE module only (no `next/headers`, no @keenan/services,
  // no @/lib/store) — see the note at the top of `lib/guard/index.ts`. The server-side
  // reader lives in `@/lib/acquisition` and must never be imported here.
} from "@/lib/acquisition-campaign";

/**
 * Runs for EVERY storefront route (see matcher), and dispatches:
 *
 *   1. the abuse guard — rate limiting and temporary bans for scraping;
 *   2. /json/*   — the JSON draft-preview surface;
 *   3. /render/* — the chrome-free CMS render surface;
 *   4. everything else falls through, picking up the first-touch campaign cookie
 *      on the way if this visit carries one.
 *
 * HISTORY: this file used to be scoped to /render/* and /json/* only, and
 * applied the CMS-render headers unconditionally to whatever the matcher
 * caught. Now that the matcher is site-wide, those branches MUST stay explicit
 * — a fall-through would tag every storefront page with `x-cms-render` and
 * render the whole shop chrome-free.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Abuse guard ─────────────────────────────────────────────────────────
  // First, so a blocked request costs nothing beyond a hash lookup. This is the
  // whole reason the guard lives in the proxy: the root layout is
  // `force-dynamic`, so there is no page cache to absorb anything, and every
  // request that gets past here is a full RSC render plus DB round trips.
  // Fails open internally — never throws.
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  // ── 2. /json/* — the parallel JSON preview surface ─────────────────────────
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

  // ── 3. /render/* — the chrome-free CMS render surface ──────────────────────
  // Tags the request so the root layout skips Header/Footer/analytics (bare
  // shell), locks framing to the portal (the pages are embedded in the portal's
  // page-builder / component-library iframes), and keeps it out of search
  // indexes.
  if (pathname === "/render" || pathname.startsWith("/render/")) {
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

  // ── 4. Ordinary storefront traffic ─────────────────────────────────────────
  // Untouched, except that a visitor arriving on a campaign link picks up the
  // first-touch cookie here (card T7Wclho8), so the quote they raise later can say
  // which campaign produced it.
  //
  // LAST on purpose. It used to run at position 2 and returned its own
  // `NextResponse.next()`, which meant any /json/* or /render/* address carrying a
  // utm_* parameter skipped the rewrite, the `x-kg-json` / `x-cms-render` headers, the
  // frame-ancestors CSP lock to the portal and the noindex — the CMS preview surfaces
  // silently losing every one of their protections to a stray query parameter. Down
  // here those branches have already returned, so the comment "only the pages that fall
  // through can reach this" is true of the code rather than of the intention.
  return attachCampaignCookie(req) ?? NextResponse.next();
}

/**
 * The response carrying this visitor's first-touch campaign, or null when there is
 * nothing to record — which is every request that has no utm_* parameter, and every
 * request from a visitor who already carries the cookie (first touch wins).
 *
 * Returns a plain `NextResponse.next()` with the cookie attached, so the page renders
 * exactly as it would have. It is called from the LAST branch only, so /json and
 * /render keep their own responses intact — a campaign link into a CMS preview is not
 * a shopper's arrival, and stealing its response cost it the headers that lock it down.
 */
function attachCampaignCookie(req: NextRequest): NextResponse | null {
  if (req.cookies.has(ACQUISITION_COOKIE)) return null;
  const bag = acquisitionBagFromRequest(req.nextUrl, req.headers.get("referer"));
  if (!bag) return null;
  const res = NextResponse.next();
  res.cookies.set(ACQUISITION_COOKIE, encodeURIComponent(JSON.stringify(bag)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACQUISITION_MAX_AGE,
  });
  return res;
}

export const config = {
  // Everything except Next's own static output, which should never reach JS.
  // Functional exemptions (/api/health, /api/revalidate, …) live in
  // lib/guard/surfaces.ts, where they are readable and cannot be dodged by
  // trailing-slash or encoding tricks.
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
