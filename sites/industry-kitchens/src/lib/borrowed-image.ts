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
 *    borrowed question — `ownersNeedingBorrowedImage` in `@keenan/services`
 *    only names the empty ones, so the 412 brands and 4,915 categories that
 *    already carry artwork cost no lookups and cannot be overruled.
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
 * "USABLE" is `isAllowedImageUrl`, the image proxy's own allowlist, and it is
 * checked HERE rather than in the query on purpose: `/api/image` 403s anything
 * outside our own buckets and a 403 draws the browser's broken-image glyph —
 * exactly the tile gRLRF8yu promised Steve we would not ship. One copy of that
 * allowlist, on the storefront that enforces it.
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
 * The picture this record should draw, or `null` for "draw the no-picture
 * branch".
 *
 * The record's OWN picture wins whenever it is usable. A record carrying a real
 * but unusable URL falls through to a borrowed one — that is a broken picture,
 * and showing a real product beats showing the browser's broken-image glyph
 * while somebody fixes the source.
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
