import { notFound, permanentRedirect } from "next/navigation";
import { getBlogPostBySlug, getCategoryBySlug, getCmsPage, getProductBySlug } from "@/lib/store";
import { isReservedCatchAllPath, normalizeLookupPath } from "@/lib/redirect-path";
import { redirectIfMapped } from "@/lib/redirect-seam";
import { legacyProbes, newStyleAddress } from "@/lib/legacy-address";

/**
 * Last-resort route: any address no other route claims.
 *
 * The legacy Industry Kitchens site served everything from the root — `/about-us`,
 * `/shop-online/catering-equipment`, `/roband-dm31w`, `/Greek/…` — and none of those
 * shapes exists on the new storefront, so before this route they reached Next's 404
 * without anything ever consulting `url_redirects`. That is the "extend redirect
 * handling beyond product pages to any address" half of card EVvRDnZt, and it is what
 * makes the imported Zoey map do anything at all.
 *
 * Two passes, in this order and for a reason:
 *
 *  1. `url_redirects` — the imported Zoey map, the retire worker's rows and anything a
 *     person typed on the portal screen. These are DECIDED answers, including the ones
 *     that deliberately send a dead product to a category, so they win.
 *  2. The catalogue itself — an address that is simply the OLD SHAPE of a page that
 *     still exists (`/terms-and-conditions` → `/pages/terms-and-conditions`). The old
 *     site never had a redirect for these, because they were the live pages, so no
 *     export contains them.
 *
 * Routes that EXIST still win over both: Next matches static and dynamic segments before a
 * catch-all, so `/products/x`, `/categories/x` and the rest never reach this file. What
 * does reach it is an address under a namespace with nothing behind it — `/api/typo`,
 * `/_next/whatever` — and those are answered with a plain 404 before any lookup runs
 * (`isReservedCatchAllPath`): an API caller wants a 404, not a page, and it is also the
 * traffic scanners generate most of. Otherwise this route only runs where the answer used
 * to be a flat 404 — and when neither pass finds anything it still is one, rendered by the
 * site's own `not-found.tsx`.
 */
export const dynamic = "force-dynamic";

export default async function LegacyAddress({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const pathname = `/${(path ?? []).join("/")}`;

  // Zoey sometimes emitted the same address behind `/index.php/`
  // (`/index.php/Blog/warranty-tips/`). It IS the same address — drop the
  // prefix and let the rest go through the ordinary probes.
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0]?.toLowerCase() === "index.php" && segments.length > 1) {
    permanentRedirect(`/${segments.slice(1).join("/")}`);
  }

  // The old blog's front page was /Blog (capital B). /blog is its own route, so only another
  // spelling reaches here — and a url_redirects row can't carry it: redirectIfMapped compares
  // paths case-blind and drops "/Blog -> /blog" as a loop to itself.
  if (segments.length === 1 && segments[0].toLowerCase() === "blog") permanentRedirect("/blog");

  // An explicit redirect row ALWAYS wins, even under a reserved segment. The
  // reserved check used to run first, so rows for the old site's
  // `/customer/account/login` and `/customer/account/create` could never fire —
  // the shopper got a 404 that a stored redirect was sitting there to prevent.
  // The reserved list still spares the legacy PROBES (a DB round trip per stray
  // crawler hit); the redirect lookup is cached and filters asset-like paths.
  await redirectIfMapped(pathname);

  if (isReservedCatchAllPath(pathname)) notFound();

  const normalized = normalizeLookupPath(pathname);
  if (normalized && normalized !== "/") {
    for (const probe of legacyProbes(normalized)) {
      const found =
        probe.kind === "product"
          ? await getProductBySlug(probe.slug)
          : probe.kind === "category"
            ? await getCategoryBySlug(probe.slug)
            : probe.kind === "blog"
              ? await getBlogPostBySlug(probe.slug)
              : await getCmsPage(probe.slug);
      // A relative Location, always — never rebuild it from a request header or an env
      // var, or production hands the shopper the container's hostname (card KVBIakGf).
      if (found) permanentRedirect(newStyleAddress(probe));
    }
  }

  notFound();
}
