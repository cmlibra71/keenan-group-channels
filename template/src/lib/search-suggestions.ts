// Bounds and arithmetic for the HEADER search bar's suggestion dropdown.
//
// Pure: no framework, no fetch — so the numbers the dropdown stops on are
// unit-tested, and so the hook (components/search/use-search-suggestions.ts)
// and both renderers (SearchTypeahead in all three trees, IK's HeaderSearch)
// share ONE definition of every bound instead of four copies that drift.
//
// The dropdown pages the same way `/search` does (G3gpxN0k): 40 at a time, and
// never past the same 320-result anti-enumeration ceiling. Those two numbers
// are deliberately the SAME numbers as `lib/search-results.ts`, and
// `search-suggestions.test.ts` asserts it, because a shopper who scrolls the
// dropdown to its end and then clicks "view all" must not find the two lists
// disagreeing about where the results stop.

/** Suggestions fetched per request — the first open and each scroll load. */
export const SUGGESTIONS_PER_PAGE = 40;
/** Deepest the dropdown will ever reach. Mirrors search-results MAX_RESULTS. */
export const MAX_SUGGESTIONS = 320;

/**
 * Rows to ask for at `loaded`. The last page is short rather than overshooting
 * the ceiling: the public endpoint clamps `offset + limit` to the same 320, so
 * asking for more would silently return fewer and look like an exhausted index.
 */
export function suggestionPageSize(loaded: number): number {
  return Math.max(0, Math.min(SUGGESTIONS_PER_PAGE, MAX_SUGGESTIONS - Math.max(0, loaded)));
}

/**
 * Results still fetchable after `loaded`, given the index's count and the cap.
 * This is the arithmetic the dropdown stops on, so the tests cover the live
 * bound rather than a lookalike.
 */
export function remainingSuggestions(loaded: number, total: number): number {
  return Math.max(0, Math.min(Math.max(0, total), MAX_SUGGESTIONS) - Math.max(0, loaded));
}

/** True when the index holds more than the dropdown will ever show. */
export function isSuggestionsCapped(total: number): boolean {
  return total > MAX_SUGGESTIONS;
}

/**
 * Where the next request starts.
 *
 * Built from POSITIONS CONSUMED, never from rows rendered. `/api/search`
 * applies per-account catalogue scope to the window it fetched, so a 40-row
 * window can legitimately hand back fewer than 40 hits; paging on the rendered
 * count would re-request exactly the rows that were just skipped and the
 * shopper would see duplicates. (Same rule as the `/search` feed.)
 */
export function nextSuggestionOffset(offset: number, consumed: number): number {
  return Math.min(MAX_SUGGESTIONS, Math.max(0, offset) + Math.max(0, consumed));
}

/**
 * Whether another request is worth making.
 *
 * `consumed < requested` means the index itself ran out, which is the only
 * signal that can be trusted: `total` is Meilisearch's estimate (capped at its
 * own maxTotalHits — a Chefs Depot search for "oven" reports 1000) and it is
 * adjusted DOWN when catalogue scope drops rows, so it can neither prove nor
 * disprove that more exist.
 */
export function hasMoreSuggestions(opts: {
  nextOffset: number;
  consumed: number;
  requested: number;
}): boolean {
  const { nextOffset, consumed, requested } = opts;
  if (requested <= 0) return false;
  if (consumed < requested) return false;
  return nextOffset < MAX_SUGGESTIONS;
}

/** The `/api/search` query string for one window. Bounds applied here, too. */
export function suggestionRequestUrl(query: string, offset: number): string {
  const start = Math.max(0, Math.min(MAX_SUGGESTIONS, offset));
  const limit = suggestionPageSize(start);
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (start > 0) params.set("offset", String(start));
  return `/api/search?${params.toString()}`;
}
