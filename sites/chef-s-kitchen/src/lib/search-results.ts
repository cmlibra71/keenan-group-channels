// Parsing, clamping and Meilisearch filter-building for the /search RESULTS
// page and its "load more" server action.
//
// Pure: no framework, no store, no Meilisearch — so it can be unit-tested, and
// so the page and the server action share ONE definition of every bound. The
// action is a public POST endpoint whose arguments are attacker-controlled, so
// it must re-apply exactly the same clamps the page applies to its query
// string; two copies of these rules would drift.

/** Results fetched per request — the first server render and each scroll load. */
export const PER_PAGE = 40;
/**
 * Hard cap on how deep the feed goes. `offset = loaded` was previously
 * unbounded, which let anyone walk straight through the catalogue; continuous
 * scroll makes that easier to reach by hand, so the cap stays exactly where the
 * numbered pager had it (8 x 40).
 */
export const MAX_PAGES = 8;
export const MAX_RESULTS = PER_PAGE * MAX_PAGES;

/** Longer than any real product search; bounds what is handed to Meilisearch. */
export const MAX_QUERY_LENGTH = 200;
/** Facet values are free-form brand/category NAMES, so both are bounded. */
export const MAX_FACET_VALUES = 20;
export const MAX_FACET_VALUE_LENGTH = 120;

export const PRICE_KEYS = ["lt1000", "1000to3000", "gt3000"] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

export const PRICE_LABELS: Record<string, string> = {
  lt1000: "Under $1,000",
  "1000to3000": "$1,000–$3,000",
  gt3000: "$3,000+",
};

export const SEARCH_SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
  { value: "newest", label: "Newest" },
];

export const SORT_MAP: Record<string, string[] | undefined> = {
  price_asc: ["price:asc"],
  price_desc: ["price:desc"],
  newest: ["createdAt:desc"],
};

/** The parameters that identify one result feed. Carried into the action. */
export type SearchFeedParams = {
  q: string;
  brand?: string;
  category?: string;
  price?: string;
  sort?: string;
};

// Multi-select params are comma-joined; brand/category facet *values* are
// percent-encoded names (names can contain commas), so split first, decode after.
export const parseMulti = (v?: string): string[] =>
  v?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];

export const decVal = (v: string): string => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** Meili string literal with escaped backslashes/quotes. */
export const meiliStr = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export const bandExpr = (k: string): string =>
  k === "lt1000" ? "price < 1000" : k === "1000to3000" ? "(price >= 1000 AND price <= 3000)" : "price > 3000";

export function sanitizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

/** Facet values arrive percent-encoded; bounded in both count and length. */
export function sanitizeFacetValues(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return parseMulti(raw)
    .slice(0, MAX_FACET_VALUES)
    .map((v) => decVal(v).slice(0, MAX_FACET_VALUE_LENGTH))
    .filter(Boolean);
}

export function sanitizePriceKeys(raw: unknown): PriceKey[] {
  if (typeof raw !== "string") return [];
  return parseMulti(raw).filter((k): k is PriceKey => (PRICE_KEYS as readonly string[]).includes(k));
}

export function sanitizeSortKey(raw: unknown): string {
  return typeof raw === "string" && raw in SORT_MAP ? raw : "relevance";
}

/** `?page=` is the no-JavaScript fallback: page N renders results 1..N*PER_PAGE. */
export function clampPage(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_PAGES, Math.max(1, Math.trunc(n)));
}

/** How many results the feed already holds. Never negative, never past the cap. */
export function clampOffset(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_RESULTS, Math.max(0, Math.trunc(n)));
}

/**
 * Results still fetchable after `loaded`, given the index count and the cap.
 * This is the arithmetic the feed stops on — `SearchResultsFeed` calls it, so
 * the tests below cover the live bound rather than a lookalike.
 */
export function remainingResults(loaded: number, total: number): number {
  return Math.max(0, Math.min(total, MAX_RESULTS) - Math.max(0, loaded));
}

/**
 * True when the index holds more results than the feed will ever show, so the
 * page can say so instead of just stopping silently mid-scroll.
 */
export function isCappedByLimit(total: number): boolean {
  return total > MAX_RESULTS;
}

/**
 * The Meilisearch filter clauses for the selected facets. Values are quoted with
 * `meiliStr`, never concatenated raw.
 */
export function buildFilterClauses(opts: {
  brandValues: string[];
  categoryValues: string[];
  priceKeys: string[];
}): { brandClause: string | null; categoryClause: string | null; priceClause: string | null } {
  const { brandValues, categoryValues, priceKeys } = opts;
  return {
    brandClause: brandValues.length ? `brandName IN [${brandValues.map(meiliStr).join(", ")}]` : null,
    categoryClause: categoryValues.length
      ? `categoryNames IN [${categoryValues.map(meiliStr).join(", ")}]`
      : null,
    priceClause: priceKeys.length ? `(${priceKeys.map(bandExpr).join(" OR ")})` : null,
  };
}

/** Meilisearch wants `undefined`, not an empty array, when nothing is filtered. */
export function andFilters(...clauses: (string | null)[]): string[] | undefined {
  const kept = clauses.filter((c): c is string => Boolean(c));
  return kept.length ? kept : undefined;
}
