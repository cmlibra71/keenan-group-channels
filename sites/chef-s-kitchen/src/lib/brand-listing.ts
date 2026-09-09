/**
 * The brand page's listing, expressed the way the category page's already is
 * (card xOBnQarT: "a brand page lists its categories and products with working
 * filters and load-more, the way category pages already do").
 *
 * PURE module — no DB, no server-only imports — so a route and a test can both
 * read it. Everything the brand page renders comes from components the category
 * page already uses (`FacetRail`, `FacetChips`, `SortSelect`, `ProductGrid`);
 * this file is only the glue that turns URL params into listing options and
 * listing facets into the generic `FacetGroupDef` those components take. There
 * is deliberately no second rail, no second grid and no second sort control.
 *
 * Two differences from the category page, both forced by what the page is:
 *  - there is no Brand facet, because the page IS one brand; and
 *  - the Sub-category facet becomes CATEGORY (`?cat=`), listing the categories
 *    this brand's products actually sit in. Its on/off and open/collapsed state
 *    still come from this channel's rail configuration (the `sub` entry of
 *    Products > Filtering): a facet a storefront switched off must not come back
 *    on a different screen, and a switched-off facet has to stop FILTERING as
 *    well as displaying (NfYe3P3G). The HEADING is always "Category" — the brand
 *    page has no sub-categories to name. The listing returns EVERY category the
 *    brand reaches; the rail trims to the biggest few (Steve: "we don't want
 *    long lists") and the tile strip above it carries the rest, so nothing the
 *    brand sits on is unreachable from the brand's own page.
 */
// Relative, not `@/…`: this module is unit-tested under `node --test`, which
// does not read the tsconfig path alias.
import type { FacetGroupDef, FacetOption } from "../components/category/FilterRail";
import { attributeParam, type AttributeFacet } from "./category-attributes";
import { normalizeStorefrontFilters, type StorefrontFilter } from "./storefront-filters";

/** Same page size and same hard cap as the category page. */
export const PER_PAGE = 24;
export const MAX_PAGES = 8;

/** How many categories the RAIL offers. The listing hands over every category
 *  the brand reaches (Vogue sits on 41 Chefs Depot shelves), but Steve's
 *  standing instruction on this rail is "we don't want long lists"
 *  (2026-08-05, card C8G4f4U8), so the rail shows the biggest few and the TILE
 *  strip above it carries the rest behind its own "Show all" disclosure — no
 *  category is unreachable from the brand's own page either way. A category the
 *  shopper has already TICKED is always kept, wherever it sits in the order, or
 *  it could not be unticked. */
export const RAIL_CATEGORY_LIMIT = 12;

/** The category facet's URL param. Namespaced away from the category page's
 *  `sub` so a link copied between the two screens cannot half-apply. */
export const CATEGORY_PARAM = "cat";

export const BRAND_SORTS = ["price_asc", "price_desc", "saving", "newest"] as const;
export type BrandSort = (typeof BRAND_SORTS)[number] | "relevance";

/** Facets as `getBrandListing` returns them. */
export interface BrandListingFacets {
  categories: { id: number; name: string; slug: string; count: number }[];
  price: { key: string; count: number }[];
  priceRange?: { min: number; max: number } | null;
  attributes?: AttributeFacet[];
}

export type BrandSearchParams = {
  cat?: string;
  price?: string;
  sort?: string;
  page?: string;
  /** Attribute filters arrive as `f_<code>` (C8G4f4U8). */
  [param: string]: string | undefined;
};

const PRICE_LABELS: Record<string, string> = {
  lt1000: "Under $1,000",
  "1000to3000": "$1,000–$3,000",
  gt3000: "$3,000+",
};

/** How many ids a single `?cat=` will ever be believed for. No brand reaches
 *  anywhere near this many categories, so it costs a real shopper nothing; it
 *  exists so a hand-typed `?cat=1,2,3,…` cannot turn one URL into an `ARRAY[]`
 *  of tens of thousands of bind parameters. */
export const MAX_CATEGORY_IDS = 200;

/** Comma-joined ids, as every facet param on these screens is written. */
export function parseIds(v?: string): number[] {
  return (
    v
      ?.split(",")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isInteger(n))
      .slice(0, MAX_CATEGORY_IDS) ?? []
  );
}

export function parseBrandSort(raw?: string): BrandSort {
  return (BRAND_SORTS as readonly string[]).includes(raw ?? "") ? (raw as BrandSort) : "relevance";
}

/** `?page=` is cumulative — page N renders results 1..N*PER_PAGE — and capped,
 *  exactly as the category page's Load more is. */
export function parseBrandPage(raw?: string): number {
  return Math.min(MAX_PAGES, Math.max(1, parseInt(raw || "1", 10) || 1));
}

/** The attribute sections' URL params, so the Load-more link can carry them. */
export function attributeParamsOf(facets: BrandListingFacets): string[] {
  return (facets.attributes ?? []).map((a) => attributeParam(a.code));
}

function attributeGroups(facets: BrandListingFacets): FacetGroupDef[] {
  const groups: FacetGroupDef[] = [];
  for (const attr of facets.attributes ?? []) {
    if (attr.kind === "range") {
      if (attr.min === undefined || attr.max === undefined) continue;
      groups.push({
        param: attributeParam(attr.code),
        title: attr.label,
        options: [],
        defaultOpen: true,
        range: { min: attr.min, max: attr.max, unit: attr.unit },
      });
    } else {
      const options = (attr.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
        count: o.count,
      }));
      if (options.length === 0) continue;
      groups.push({
        param: attributeParam(attr.code),
        title: attr.label,
        options,
        defaultOpen: true,
      });
    }
  }
  return groups;
}

/**
 * The Category rows the RAIL shows: the biggest `RAIL_CATEGORY_LIMIT`, in the
 * order the listing returned them (count desc, then name), plus every category
 * the shopper has already ticked — a ticked row that fell off the end would be
 * a filter with no way to remove it. Ticked rows keep their position in the
 * listing order, so the list does not reshuffle as boxes are ticked.
 */
export function railCategoryOptions(
  categories: BrandListingFacets["categories"],
  selectedCategoryIds: number[] = [],
  limit = RAIL_CATEGORY_LIMIT
): FacetOption[] {
  const selected = new Set(selectedCategoryIds);
  const kept = categories.filter((c, i) => i < limit || selected.has(c.id));
  return kept.map((c) => ({ value: String(c.id), label: c.name, count: c.count }));
}

/**
 * The brand rail's groups, in this channel's configured order: Category (the
 * `sub` entry), Price, then whichever product-detail sections the brand's
 * products earned. Brand is skipped — the page is one brand.
 */
export function brandFacetGroups(
  facets: BrandListingFacets,
  filters?: StorefrontFilter[],
  selectedCategoryIds: number[] = []
): FacetGroupDef[] {
  const config = normalizeStorefrontFilters(filters);
  const groups: FacetGroupDef[] = [];

  for (const filter of config) {
    if (!filter.enabled) continue;
    if (filter.id === "brand") continue;

    if (filter.id === "sub") {
      const options = railCategoryOptions(facets.categories, selectedCategoryIds);
      if (options.length === 0) continue;
      groups.push({
        param: CATEGORY_PARAM,
        title: "Category",
        options,
        defaultOpen: !filter.collapsed,
      });
      continue;
    }

    // Price is a min-max slider (C8G4f4U8), keeping the three legacy band
    // tokens as labels so a bookmarked ?price=lt1000 still names itself.
    const priceOptions: FacetOption[] = facets.price.map((p) => ({
      value: p.key,
      label: PRICE_LABELS[p.key] ?? p.key,
      count: p.count,
    }));
    if (facets.priceRange) {
      groups.push({
        param: "price",
        title: filter.label,
        options: priceOptions,
        defaultOpen: !filter.collapsed,
        range: { ...facets.priceRange, money: true },
      });
      continue;
    }
    if (priceOptions.length === 0) continue;
    groups.push({
      param: "price",
      title: filter.label,
      options: priceOptions,
      defaultOpen: !filter.collapsed,
    });
  }

  groups.push(...attributeGroups(facets));
  return groups;
}

/** Params "Clear all" and the chips act on — the enabled facets, plus every
 *  attribute section this brand offers. */
export function brandClearParams(
  facets: BrandListingFacets,
  filters?: StorefrontFilter[]
): string[] {
  const config = normalizeStorefrontFilters(filters);
  const params: string[] = [];
  for (const filter of config) {
    if (!filter.enabled || filter.id === "brand") continue;
    params.push(filter.id === "sub" ? CATEGORY_PARAM : filter.id);
  }
  return [...params, ...attributeParamsOf(facets)];
}

/**
 * The next Load-more link: the same URL with `page` advanced, carrying every
 * filter that is still switched on. A switched-off facet is dropped here too,
 * so pressing Load more can never re-apply one.
 */
export function brandNextPageHref(opts: {
  slug: string;
  searchParams: BrandSearchParams;
  page: number;
  categoryEnabled: boolean;
  priceEnabled: boolean;
  attributeParams: string[];
}): string {
  const { slug, searchParams: sp, page, categoryEnabled, priceEnabled, attributeParams } = opts;
  const next = new URLSearchParams();
  if (sp[CATEGORY_PARAM] && categoryEnabled) next.set(CATEGORY_PARAM, sp[CATEGORY_PARAM]!);
  if (sp.price && priceEnabled) next.set("price", sp.price);
  for (const param of attributeParams) {
    const value = sp[param];
    if (value) next.set(param, value);
  }
  if (sp.sort) next.set("sort", sp.sort);
  next.set("page", String(page + 1));
  return `/brands/${slug}?${next.toString()}`;
}
