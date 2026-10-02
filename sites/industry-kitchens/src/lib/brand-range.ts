// ============================================================================
// Brand RANGE pages (`/brands/<brand>/<range>`) — Industry Kitchens only.
//
// On the old site a range is a Zoey CATEGORY that sits under the "Brands" root
// (`/brands` → `/brands/fagor` → `/brands/fagor/deep-fryers-3`). Zoey lists the
// products LINKED TO THAT CATEGORY and to every category under it (an "anchor"
// category) — whatever brand those products carry. Our Main Catalog tree (257)
// holds the same Brands subtree with the same links, so the parity answer is the
// category's own product set, not "products of brand X that are also in range Y".
// The brand filter is what emptied /brands/hatco-corporation/heat-lamps-1 (its heat
// lamps belong to a different brand row) and every eurochef gastronorm range (the
// products carry no brand), and what hid Roband's warmers that sit in a child range.
//
// PURE: no database, no Next imports — every decision here is unit-tested.
// ============================================================================

/** Zoey's page size on these lists (the old site's default "Show 36"). */
export const ZOEY_RANGE_PAGE_SIZE = 36;

/** A brand-ish name reduced to what two spellings of it share: `ChefWorks`, `chef-works`,
 *  `Chef Works` → `chefworks`; Zoey's numeric disambiguator (`unox-1`) is dropped first. */
export function brandKey(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/-\d+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

interface CategoryLike {
  id: number;
  path_ids?: unknown;
}

interface BrandCategoryLike {
  slug?: string | null;
  name?: string | null;
}

interface BrandLike {
  slug?: unknown;
  name?: unknown;
  metafields?: unknown;
}

function pathIdsOf(category: CategoryLike): number[] {
  const raw = category.path_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}

/** The id of the Zoey BRAND category a range sits under (the second step of its path under the
 *  Brands root), or null when `category` is not inside the Brands subtree or IS a brand category. */
export function rangeBrandCategoryId(category: CategoryLike | null | undefined, brandsRootId: number | null | undefined): number | null {
  if (!category || !brandsRootId) return null;
  const path = pathIdsOf(category);
  if (path.length < 3 || path[0] !== brandsRootId) return null;
  return path[1] ?? null;
}

/**
 * Is `brandCategory` (the Zoey brand category a range sits under) the same brand as the page's?
 * Compared on the compact key of every spelling we hold: the address's own brand segment, the
 * brand row's slug, name and aliases, against the brand category's slug and name. A range reached
 * through someone else's brand (`/brands/fagor/accessories-17`, which is Turbofan's) is NOT a match,
 * and the page keeps its old "this brand's products in that category" behaviour.
 */
export function rangeBelongsToBrand(
  brandCategory: BrandCategoryLike | null | undefined,
  brand: BrandLike | null | undefined,
  addressSlug: string
): boolean {
  if (!brandCategory || !brand) return false;
  const aliases = (() => {
    const m = brand.metafields as { aliases?: unknown } | null | undefined;
    return Array.isArray(m?.aliases) ? (m!.aliases as unknown[]).map(String) : [];
  })();
  const ours = new Set(
    [addressSlug, String(brand.slug ?? ""), String(brand.name ?? ""), ...aliases].map(brandKey).filter(Boolean)
  );
  const theirs = [brandCategory.slug ?? "", brandCategory.name ?? ""].map(brandKey).filter(Boolean);
  return theirs.some((k) => ours.has(k));
}

/** The requested page from Zoey's `?p=` (also `?page=`); anything unusable is page 1. */
export function rangePageFromSearch(sp: Record<string, string | string[] | undefined> | null | undefined): number {
  const raw = sp?.p ?? sp?.page;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 1 ? Math.min(n, 10_000) : 1;
}

export type PagerItem = { kind: "page"; page: number; current: boolean } | { kind: "gap" };

export interface RangePager {
  page: number;
  totalPages: number;
  prev: number | null;
  next: number | null;
  items: PagerItem[];
  /** "Items 37-72 of 290" — what the old toolbar printed. */
  from: number;
  to: number;
}

/**
 * The pager for `total` products at `pageSize` a page: first, last, and two either side of the
 * current page, with a gap marker where pages are skipped. Null when everything fits on one page.
 */
export function rangePager(total: number, page: number, pageSize = ZOEY_RANGE_PAGE_SIZE): RangePager | null {
  if (!Number.isFinite(total) || total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const want = new Set<number>([1, totalPages]);
  for (let p = current - 2; p <= current + 2; p++) if (p >= 1 && p <= totalPages) want.add(p);
  const pages = [...want].sort((a, b) => a - b);
  const items: PagerItem[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) items.push({ kind: "gap" });
    items.push({ kind: "page", page: p, current: p === current });
  });
  return {
    page: current,
    totalPages,
    prev: current > 1 ? current - 1 : null,
    next: current < totalPages ? current + 1 : null,
    items,
    from: (current - 1) * pageSize + 1,
    to: Math.min(total, current * pageSize),
  };
}

/** `?p=N` on the range's own address; page 1 is the bare address (Zoey's canonical). */
export function rangePageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?p=${page}`;
}

/**
 * Where a range under a RENAMED brand address goes. Old Zoey brand slugs differ from ours for
 * ~27 brands (`chefworks` → `chef-works`, `3monkeez` → `3-monkeez`, `hatco-corporation` →
 * `hatco`), and each brand has dozens of range addresses under it. One `url_redirects` row for the
 * brand's own address carries all of them: the brand segment is swapped and the range path kept, so
 * `/brands/chefworks/chef-shirts` lands on `/brands/chef-works/chef-shirts`, which resolves its
 * range by the last segment as usual.
 *
 * `brandTarget` is the stored target for `/brands/<old>`. A target that is itself a brand address
 * takes the range path along; a target elsewhere (a brand we never carried whose products live
 * under a category, e.g. `/categories/festive`) is returned unchanged — the range cannot be
 * rebuilt there, and the category is the nearest real page. Null when nothing usable was stored.
 */
export function brandRangeRedirectTarget(brandTarget: string | null | undefined, rangePath: string[]): string | null {
  if (!brandTarget) return null;
  const clean = String(brandTarget).split("#")[0].split("?")[0].replace(/\/+$/, "");
  const m = clean.match(/^\/brands\/([^/]+)$/i);
  const rest = rangePath.map((s) => s.trim()).filter(Boolean);
  if (m && rest.length > 0) return `/brands/${m[1]}/${rest.join("/")}`;
  return clean || null;
}
