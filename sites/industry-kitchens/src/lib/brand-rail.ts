// ============================================================================
// The AUTHORED brand filter rail's URL contract (IK parity, coordinator 2026-09-30): which selections
// a brand page's node tree filters by, and the Load-more address that carries them. Pure, so the
// route's parsing is unit-tested (lib/brand-rail.test.ts).
//
// Params: `sub` = the brand's categories (its ranges); an old `cat` link is read as `sub` (the rail's
// tick boxes write `sub`, and BuilderBrandPage folds a leftover `cat` into it on the next toggle);
// `brand` = the brand's display labels (services #240); `price` = bands or the slider's window;
// `f_<code>` = attributes (already parsed by the caller); `sort`; cumulative `page`. A facet
// switched off in the portal (Products > Filtering) stops FILTERING, not merely displaying (NfYe3P3G).
// ============================================================================

import { lastPriceWindow, parsePriceBands, priceWindowTrail } from "./category-attributes";
import { parseBrandPage, parseBrandSort, parseIds, type BrandSort } from "./brand-listing";

/** Most labels a URL may select (a brand has a handful). */
export const MAX_BRAND_LABELS = 20;

export interface BrandRailSelections {
  categoryIds: number[];
  labels: string[];
  rawPrice: string | undefined;
  priceBands: ("lt1000" | "1000to3000" | "gt3000")[];
  priceRange: { min?: number; max?: number } | undefined;
  /** What the Price chip(s) name: the coded bands as ticked, or a window trail's LAST window only
   *  (Zoey showed one Price chip; removing it steps back one level). */
  priceChips: string[];
  sort: BrandSort;
  page: number;
  /** Anything narrowing the listing (the hero then needs the brand's own count). */
  filtered: boolean;
}

export function parseBrandRailSelections(
  sp: Record<string, string | undefined>,
  filtersOn: ReadonlySet<string>,
  attributeCount: number,
  defaultSort: BrandSort
): BrandRailSelections {
  const categoryIds = filtersOn.has("sub")
    ? [...new Set([...parseIds(sp.sub), ...parseIds(sp.cat)])]
    : [];
  const labels = filtersOn.has("brand")
    ? [...new Set((sp.brand ?? "").split(",").map((l) => l.trim()).filter(Boolean))].slice(0, MAX_BRAND_LABELS)
    : [];
  const rawPrice = filtersOn.has("price") && sp.price ? sp.price : undefined;
  const priceBands = parsePriceBands(rawPrice) as BrandRailSelections["priceBands"];
  // A window trail (`5000-6000,5000-5500`, Zoey's prior intervals) filters by its LAST window.
  const priceRange = priceBands.length === 0 ? lastPriceWindow(rawPrice) : undefined;
  const trail = priceBands.length === 0 ? priceWindowTrail(rawPrice) : [];
  return {
    categoryIds,
    labels,
    rawPrice,
    priceBands,
    priceRange,
    priceChips: priceBands.length ? priceBands : trail.slice(-1),
    sort: parseBrandSort(sp.sort, defaultSort),
    page: parseBrandPage(sp.page),
    filtered: categoryIds.length > 0 || labels.length > 0 || Boolean(rawPrice) || attributeCount > 0,
  };
}

/** The Load-more address: the same selections, one more (cumulative) page. `basePath` keeps the
 *  `/json` preview on its own surface. */
export function brandRailNextPageHref(opts: {
  basePath: string;
  selections: BrandRailSelections;
  attributeParams: Record<string, string>;
  sortParam?: string;
}): string {
  const { basePath, selections: s, attributeParams, sortParam } = opts;
  const next = new URLSearchParams();
  if (s.categoryIds.length) next.set("sub", s.categoryIds.join(","));
  if (s.labels.length) next.set("brand", s.labels.join(","));
  if (s.rawPrice) next.set("price", s.rawPrice);
  for (const [k, v] of Object.entries(attributeParams)) if (v) next.set(k, v);
  if (sortParam) next.set("sort", sortParam);
  next.set("page", String(s.page + 1));
  return `${basePath}?${next.toString()}`;
}
