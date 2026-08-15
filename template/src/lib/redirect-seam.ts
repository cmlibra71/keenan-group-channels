import { permanentRedirect, redirect } from "next/navigation";
import { getRedirectForPath } from "@/lib/store";
import {
  isRedirectCandidate,
  normalizeLookupPath,
  relativeRedirectTarget,
} from "@/lib/redirect-path";

/**
 * The one place a storefront address that no longer resolves is checked against
 * `url_redirects` before the shopper is shown a 404.
 *
 * Until card EVvRDnZt this lived only in the product page, so a retired PRODUCT
 * redirected and everything else — a renamed category, a legacy Zoey landing page, an
 * old brand address — bare-404ed. The Industry Kitchens cutover brings years of Zoey
 * redirects across and most of them are not product addresses, so the check has to sit
 * on every 404 seam the site has: the catch-all route for addresses no route claims, and
 * each `notFound()` in a slug route that DOES claim the address but finds nothing behind
 * it.
 *
 * The `Location` we emit is RELATIVE. `to_path` is stored relative and handed straight
 * to Next. Never resolve it against a request header or `process.env` to build an
 * absolute URL: in production the container's own hostname is what comes back, and it
 * goes out to the shopper (card KVBIakGf, found through a live rollback).
 */
export async function redirectIfMapped(pathname: string): Promise<void> {
  if (!isRedirectCandidate(pathname)) return;
  const path = normalizeLookupPath(pathname);
  if (!path) return;

  const hit = await getRedirectForPath(path);
  if (!hit?.toPath) return;

  // Last check before the browser is told where to go: the target must be a path on THIS
  // site. A row carrying an origin — or the backslash a browser reads as a slash — is
  // dropped, and the shopper gets the 404 they were already heading for.
  const target = relativeRedirectTarget(hit.toPath);
  if (!target) return;

  // A row that somehow points at itself would loop the browser. Drop it instead.
  if (normalizeLookupPath(target) === path) return;

  // 301/308 are the permanent pair (Next emits 308 for `permanentRedirect`); anything
  // else is a temporary move. Both emit the stored, relative path.
  const permanent = hit.statusCode == null || hit.statusCode === 301 || hit.statusCode === 308;
  if (permanent) permanentRedirect(target);
  redirect(target);
}
