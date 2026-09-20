/**
 * Brand PRODUCT LINES — the strip of ranges at the top of a brand landing page
 * (Rational's iCombi Pro / iCombi Classic / iVario Cooking Centre / Rational
 * Duo), and specifically where each tile's PICTURE comes from (card InEoeMZh).
 *
 * The problem this solves. A line is authored on the brand record as
 * `metafields.product_lines`, and what production actually holds is a NAME and a
 * category SLUG and nothing else — measured 2026-09-18: 2 brands of 418 carry
 * lines at all, 7 lines between them, and not one of them carries an
 * `image_url`. So every product-line tile on the site drew the grey package
 * placeholder, on the one strip whose whole job is to be a picture. Steve asked
 * for "category and product line images added … for all categories, across the
 * site" before he would call the Industry Kitchens landing pages like-for-like
 * with the legacy ones, and the legacy page shows a distinct photograph per
 * line.
 *
 * Where the picture comes from instead. A product line on Industry Kitchens IS a
 * category — `iCombi Pro` (id 1415), `iCombi Classic` (1010) and `Rational Duo`
 * (711) are all real rows in the Industry Kitchens tree, each carrying an image.
 * They are kept OUT of the menu (`include_in_menu = false`), which is why they
 * are absent from the brand listing's own category facets and why the tile could
 * not simply be given one. So the resolution is a slug lookup: the line's name,
 * slugified, is the category we want, and the line's authored slug is the
 * fallback for a line whose name does not match one (iVario Cooking Centre sits
 * at `rational-vario-cooking-centre`, so it lands on its parent Combi Ovens
 * picture rather than on nothing).
 *
 * PURE module — no DB, no server-only imports — so a route and a test can both
 * read it. The route does the (already cached) `getCategoryBySlug` calls for the
 * candidate slugs this file names and hands the answers back.
 *
 * Authored values always win. A line that carries its own `image_url` or `href`
 * keeps it: this fills gaps, it does not overrule a person.
 */

/** A line exactly as `brands.metafields.product_lines` stores it. */
export interface BrandProductLine {
  name: string;
  slug?: string;
  href?: string;
  image_url?: string;
}

/** The fields this module needs off a category row (snake_case, as the service
 *  layer returns them). */
export interface ProductLineCategory {
  slug: string;
  name?: string | null;
  image_url?: string | null;
}

/** Slug form of a line name: lower case, non-alphanumerics collapsed to single
 *  hyphens, ends trimmed. `iCombi Pro` → `icombi-pro`, which is the slug the
 *  Industry Kitchens tree actually uses. */
export function lineSlug(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Only entries with a usable NAME are lines; the name is the label and the
 *  lookup key, so an entry without one has nothing to draw. */
function usableLines(raw: unknown): BrandProductLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is BrandProductLine =>
      Boolean(l) &&
      typeof l === "object" &&
      typeof (l as BrandProductLine).name === "string" &&
      (l as BrandProductLine).name.trim().length > 0
  );
}

/**
 * Every category slug worth looking up for these lines, deduplicated and in a
 * stable order.
 *
 * A line that already carries its own image needs no lookup at all, so a brand
 * whose lines are fully authored costs nothing. Both candidates are returned for
 * the lines that do need one — the name slug first, because it is the precise
 * answer, and the authored slug second as the fallback.
 */
export function productLineCategorySlugs(raw: unknown): string[] {
  const slugs: string[] = [];
  for (const line of usableLines(raw)) {
    if (line.image_url) continue;
    const fromName = lineSlug(line.name);
    if (fromName) slugs.push(fromName);
    if (line.slug) slugs.push(line.slug);
  }
  return [...new Set(slugs)];
}

/**
 * Fill each line's picture (and, where the match is exact, its link) from the
 * categories the route looked up.
 *
 * The href only moves when the line's NAME matched a category, because that
 * match is the line itself: `iCombi Pro` resolving to the `icombi-pro` category
 * is the range's own page, and sending the reader there beats sending all four
 * Rational tiles to the one Combi Ovens shelf. A line matched only by its
 * AUTHORED slug keeps the link it was given — that slug is already the link, and
 * we borrow nothing but the picture from it.
 */
export function resolveProductLines(
  raw: unknown,
  categoriesBySlug: Map<string, ProductLineCategory | null | undefined>
): BrandProductLine[] {
  return usableLines(raw).map((line) => {
    if (line.image_url) return line;
    const nameMatch = categoriesBySlug.get(lineSlug(line.name)) ?? null;
    const slugMatch = line.slug ? (categoriesBySlug.get(line.slug) ?? null) : null;
    const image = nameMatch?.image_url || slugMatch?.image_url || undefined;
    const resolved: BrandProductLine = { ...line };
    if (image) resolved.image_url = image;
    if (!line.href && nameMatch?.slug) resolved.href = `/categories/${nameMatch.slug}`;
    return resolved;
  });
}
