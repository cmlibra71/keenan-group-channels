// Parsing and clamping for the PUBLIC /api/search endpoint.
//
// Pure so it can be unit-tested without Next or Meilisearch.

/** Minimum query length. Single characters enumerate the catalogue cheaply. */
export const MIN_QUERY_LENGTH = 2;

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;

/**
 * How deep this endpoint will ever reach, in index POSITIONS.
 *
 * The header suggestion dropdown now pages (G3gpxN0k), so "typeahead never
 * pages" is no longer true and the old flat `MAX_OFFSET = 200` no longer
 * describes the bound that matters. The bound that matters is the same
 * anti-enumeration ceiling `/search` enforces: `MAX_RESULTS` in
 * `lib/search-results.ts` (8 x 40). Kept as a literal rather than an import so
 * this module stays free of cross-module resolution — `search-suggestions.test.ts`
 * asserts the two agree, so they cannot drift apart silently.
 *
 * `offset + limit` is clamped to it below, which makes the reachable window
 * EXACTLY 320 rows per query where the old pair (offset <= 200, limit <= 50)
 * reached 250.
 */
export const MAX_RESULT_WINDOW = 320;
/** Deepest first row. The window clamp below does the rest. */
export const MAX_OFFSET = MAX_RESULT_WINDOW - 1;

/** Sort expressions the public endpoint will pass to Meilisearch. */
export const ALLOWED_SORT = ["price:asc", "price:desc", "createdAt:desc"] as const;

/** Facets the public endpoint will compute. */
export const ALLOWED_FACETS = ["brandName", "categoryNames"] as const;

/**
 * `parseInt("abc")` is NaN, and `Math.min(NaN, 100)` is NaN — which the previous
 * implementation handed straight to Meilisearch. Anything non-finite falls back
 * to the default here.
 */
export function clampInt(
  raw: string | null | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === null || raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function allowlist<T extends readonly string[]>(
  raw: string | null | undefined,
  allowed: T
): T[number][] | undefined {
  if (!raw) return undefined;
  const picked = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T[number] => (allowed as readonly string[]).includes(s));
  return picked.length ? picked : undefined;
}

export type PublicSearchParams = {
  q: string;
  limit: number;
  offset: number;
  sort?: string[];
  facets?: string[];
  /** True when the query is too short to be worth running. */
  tooShort: boolean;
};

/**
 * NOTE ON `filter`: this endpoint used to forward an arbitrary Meilisearch
 * filter expression straight through, which made the whole catalogue
 * enumerable by anyone who could type a URL. No caller has ever used it — every
 * consumer (SearchTypeahead in all three trees, plus IK's HeaderSearch) sends
 * only `q`, `limit` and `offset` — so the parameter is DROPPED rather than
 * sanitised.
 * Sanitising a filter grammar is a losing game; not having one is not.
 *
 * If structured filtering is needed later, add explicit `brand` / `category`
 * params here and compose the expression server-side.
 */
export function parsePublicSearchParams(sp: URLSearchParams): PublicSearchParams {
  const q = (sp.get("q") || "").trim();
  const offset = clampInt(sp.get("offset"), 0, MAX_OFFSET, 0);
  // The window, not just its start: a request at offset 319 may still ask for
  // 50 rows, and without this clamp the reachable depth would be 369, not 320.
  const limit = Math.min(
    clampInt(sp.get("limit"), 1, MAX_LIMIT, DEFAULT_LIMIT),
    MAX_RESULT_WINDOW - offset
  );
  return {
    q,
    tooShort: q.length < MIN_QUERY_LENGTH,
    limit,
    offset,
    sort: allowlist(sp.get("sort"), ALLOWED_SORT),
    facets: allowlist(sp.get("facets"), ALLOWED_FACETS),
  };
}
