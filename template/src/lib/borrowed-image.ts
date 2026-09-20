/**
 * The picture a BRAND or CATEGORY landing page shows when it has none of its own
 * — borrowed, at render time, from the products the page already lists.
 *
 * Chris, 2026-09-18 (card InEoeMZh): "use product images". Six brands of 418 and
 * eight product-bearing categories of 4,958 carry no `image_url`, and two of the
 * eight are the pages a shopper is most likely to arrive on from Google (Combi
 * Ovens, 687 products; Pizza Ovens, 367). No artwork is commissioned and nothing
 * waits on a person: the page shows one of its own products instead.
 *
 * FOUR RULES, all his:
 *
 * 1. **A page whose own picture is set keeps it.** Enforced by never asking the
 *    borrowed question — `ownersNeedingBorrowedImage` (below) names only the
 *    records with no picture this storefront could draw, so the 412 brands and
 *    4,915 categories that already carry usable artwork cost no lookups and
 *    cannot be overruled.
 * 2. **Nothing is written to `brands.image_url` or `categories.image_url`.**
 *    This module returns a value; it never persists one. Real artwork added
 *    later just takes over, and a retired product cannot leave a stale copy
 *    stamped into the record.
 * 3. **The same product every time.** Candidates arrive from the query in one
 *    fixed order — lowest product id first — and the first USABLE one wins. Not
 *    "first on the page", which moves with the shopper's sort and filters and
 *    with this storefront's own default order; not "newest", which changes every
 *    time the catalogue grows.
 * 4. **A brand or category with neither picture nor products still renders.**
 *    The answer is then `null`, and every caller already has a no-picture
 *    branch: the brand hero drops its logo card and its text takes the full
 *    width, a tile keeps the grey placeholder box with the package icon
 *    (gRLRF8yu — Steve, 2026-08-10: the grey box stays, a broken-image glyph
 *    does not). Measured on production 2026-09-18, 5 of the 6 pictureless brands
 *    have no storefront-visible products at all, so this is the common branch
 *    for brands, not the rare one.
 *
 * "USABLE" is `isAllowedImageUrl`, the image proxy's own allowlist, and this
 * module owns BOTH halves of that question on purpose — which records need a
 * borrow, and which candidate is drawable. `/api/image` 403s anything outside
 * our own buckets and a 403 draws the browser's broken-image glyph, exactly the
 * tile gRLRF8yu promised Steve we would not ship; `@keenan/services` therefore
 * fetches candidates for the ids it is handed and asks nothing about them, so
 * that allowlist exists once, on the storefront that enforces it.
 *
 * WHAT THIS DOES NOT REACH, measured on production 2026-09-18 — a pictureless
 * DEPARTMENT can still draw the placeholder, and that is known, not missed:
 * - A category borrows only from products assigned DIRECTLY to it
 *   (`product_categories`), never from its children's. A department whose
 *   products all sit in its subcategories has no candidates at all: on Chefs
 *   Depot that is the two root departments "Stainless Steel, Sinks & Plumbing"
 *   (1027894: 8 children, 0 direct products) and "Equipment Parts &
 *   Accessories" (1027895: 1 child, 0 direct), both live today on
 *   `chefsdepot.com.au/categories`.
 * - `getCategories`, `getSubcategories` and the brand page's category facets go
 *   through this module. `getTopCategories` and the mega menu do NOT, so the
 *   Chefs Depot home department grid and the `/products` department strip keep
 *   the placeholder for a pictureless department even where one could be
 *   borrowed.
 * Closing either needs a decision that is not this card's: a descendant walk in
 * the candidate query, or a picture chosen by a person. Both are on the card.
 *
 * PURE module — no DB, no server-only imports — so a route and a test can both
 * read it. The route does the (cached) `getBorrowedImageCandidates` read and
 * hands the answers here.
 */

import { isAllowedImageUrl } from "./image-origin";

/** A record that may or may not carry a picture, snake_case as the service layer
 *  returns it. */
export interface PicturedRecord {
  id: number;
  image_url?: string | null;
}

/** What `productService.borrowedImageCandidates` returns: candidate photographs
 *  per owner id, already in the fixed lowest-product-id-first order. */
export type BorrowedImageCandidates = Record<number, string[] | undefined>;

/** A picture we can actually put in an `<img>`: present, and inside the image
 *  proxy's allowlist. */
function usable(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().length > 0 && isAllowedImageUrl(url);
}

/**
 * Which records to probe for a borrowed picture: the ones with no picture this
 * storefront could actually draw.
 *
 * That is an EMPTY field or a URL the image proxy's allowlist rejects — the same
 * `usable` test `borrowedImageFor` applies below, so the fetch step and the
 * resolve step cannot disagree about the same row. (Asking `@keenan/services`
 * this question instead would mean either a second copy of the allowlist in SQL
 * or a row that is looked up by one rule and resolved by another; the second is
 * what shipped first and it made the documented fallthrough unreachable.)
 *
 * A record that HAS a usable picture is never looked up, which is how Chris's
 * rule 1 is enforced and why the 412 brands and 4,915 categories already
 * carrying artwork cost nothing.
 *
 * Returned sorted and de-duplicated so the cache key a caller builds from it is
 * stable.
 */
export function ownersNeedingBorrowedImage(
  owners: readonly (PicturedRecord | null | undefined)[]
): number[] {
  const ids = new Set<number>();
  for (const owner of owners) {
    if (!owner) continue;
    if (!usable(owner.image_url)) ids.add(owner.id);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * The picture this record should draw, or `null` for "draw the no-picture
 * branch".
 *
 * The record's OWN picture wins whenever it is usable. A record carrying a real
 * but unusable URL falls through to a borrowed one — that is a broken picture,
 * and showing a real product beats showing the browser's broken-image glyph
 * while somebody fixes the source. That fallthrough is only reachable because
 * `ownersNeedingBorrowedImage` above counts such a record as pictureless and
 * fetches candidates for it.
 */
export function borrowedImageFor(
  record: PicturedRecord | null | undefined,
  candidates: BorrowedImageCandidates
): string | null {
  if (!record) return null;
  if (usable(record.image_url)) return record.image_url as string;
  for (const candidate of candidates[record.id] ?? []) {
    if (usable(candidate)) return candidate;
  }
  return null;
}

/**
 * The same resolution applied to a LIST, writing the answer back onto each row's
 * `image_url`.
 *
 * Writing to `image_url` — rather than adding a second field — is what makes one
 * change reach BOTH render paths: the sealed tile reads `sub.image_url` and the
 * authored Site Builder tree binds the very same `sub.image_url` (Industry
 * Kitchens renders its category page from that tree, so a fix that only touched
 * the sealed component would be invisible on the site this card exists for).
 * It is a copy of the row on its way to the screen and nothing else — no write
 * reaches the database from here.
 *
 * A row that resolves to nothing has its `image_url` NORMALISED to `null` rather
 * than left as an unusable string, so the caller's "no picture" test and this
 * module's cannot disagree about the same row.
 */
export function applyBorrowedImages<T extends PicturedRecord>(
  records: readonly T[],
  candidates: BorrowedImageCandidates
): T[] {
  return records.map((record) => {
    const resolved = borrowedImageFor(record, candidates);
    if (resolved === (record.image_url ?? null)) return record;
    return { ...record, image_url: resolved };
  });
}
