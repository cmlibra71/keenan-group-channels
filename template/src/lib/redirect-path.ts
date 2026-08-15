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
  // A BACKSLASH IS A SLASH to a browser resolving an address (WHATWG URL, "relative
  // slash state"): `/\evil.com` is https://evil.com/, not a page here. Fold them first
  // so the duplicate-slash collapse below reduces it to the local path it reads as.
  let value = String(pathname).split("#")[0].split("?")[0].trim().replace(/\\/g, "/");
  if (!value) return null;
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value.toLowerCase();
}

/**
 * The value that may be handed to `Location`, or `null` if it cannot be trusted.
 *
 * `to_path` is written by the portal screen, the Zoey importer and the retire worker, and
 * all three store a site-relative path — but the storefront is the last thing between a
 * stored row and the shopper's browser, so it checks rather than assumes. Anything that
 * would resolve to another origin (a scheme, `//host`, or the backslash a browser reads
 * as a slash) is dropped and the shopper sees the 404 they were already getting.
 *
 * A query string or fragment on the target is kept: only the leading shape decides where
 * the browser ends up.
 */
export function relativeRedirectTarget(toPath: string | null | undefined): string | null {
  if (!toPath) return null;
  const raw = String(toPath).trim();
  if (!raw) return null;

  const cut = raw.search(/[?#]/);
  const suffix = cut === -1 ? "" : raw.slice(cut);
  let value = (cut === -1 ? raw : raw.slice(0, cut)).replace(/\\/g, "/");
  if (!value) return null;

  // "https://…", "javascript:…" — a scheme is never ours to emit.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (!value.startsWith("/")) value = `/${value}`;
  // Collapsing every run of slashes is what disarms the protocol-relative `//evil.com`:
  // it becomes the local `/evil.com`, the same shape the portal would have stored.
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  if (!value.startsWith("/")) return null;
  return `${value}${suffix}`;
}

/**
 * First segments the CATCH-ALL route refuses outright.
 *
 * Next matches every real route before `app/[...path]`, but a path under a namespace with
 * NO handler behind it — `/api/typo`, `/_next/whatever` — still falls through to the
 * catch-all, and answering those with a redirect lookup and three catalogue probes is
 * both wrong (an API caller wants a 404, not HTML) and wasted work on the exact traffic
 * scanners generate most of. Kept in step with `RESERVED_FROM_SEGMENTS` in the portal
 * (`src/lib/redirects/path.ts`), which refuses the same prefixes on the way IN.
 *
 * This is deliberately NOT applied inside `redirectIfMapped`: the retire worker's rows are
 * `/products/<slug>`, and those are looked up from the product route's own 404 seam.
 */
export const RESERVED_CATCH_ALL_SEGMENTS = new Set([
  "_next",
  "account",
  "admin",
  "api",
  "cart",
  "catalog",
  "checkout",
  "clearance",
  "customer",
  "index.php",
  "json",
  "membership",
  "products",
  "render",
  "robots.txt",
  "search",
  "sitemap.xml",
]);

/** True when the catch-all should answer with a plain 404 and nothing else. */
export function isReservedCatchAllPath(pathname: string | null | undefined): boolean {
  const path = normalizeLookupPath(pathname);
  if (!path) return false;
  const first = path.split("/").filter(Boolean)[0] ?? "";
  return RESERVED_CATCH_ALL_SEGMENTS.has(first);
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
