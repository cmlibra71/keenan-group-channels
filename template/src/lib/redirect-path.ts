/**
 * The shape a storefront address is reduced to before it is looked up in `url_redirects`.
 *
 * Rows are stored site-relative and lower-case with no query, fragment or trailing
 * slash, so `/About-Us/?utm_source=x` and `/about-us` are ONE row rather than three
 * misses. Keep this in step with `src/lib/redirects/path.ts` in the portal, which
 * normalises the same way on write — the two together are why the lookup can be a
 * single indexed equality read.
 *
 * Pure on purpose: no database, no Next imports, so it is unit-testable on its own.
 */

/** Canonical lookup shape, or `null` when there is nothing to look up. */
export function normalizeLookupPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  let value = String(pathname).split("#")[0].split("?")[0].trim();
  if (!value) return null;
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value.toLowerCase();
}

/**
 * Addresses that can never be a redirect. Asset requests miss the table by definition,
 * and the catch-all route is reached by every stray crawler path, so it is worth not
 * paying for a database round trip to learn that `/favicon-32.png` is still missing.
 */
const ASSET_LIKE =
  /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|txt|json|webmanifest)$/i;

export function isRedirectCandidate(pathname: string): boolean {
  const path = normalizeLookupPath(pathname);
  if (!path || path === "/") return false;
  return !ASSET_LIKE.test(path);
}
