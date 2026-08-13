"use server";

import { ProductGrid } from "@/components/product/ProductGrid";
import { getListingPricing } from "@/lib/member";
import { getFeatureFlag } from "@/lib/store";
import {
  MAX_RESULTS,
  PER_PAGE,
  clampOffset,
  sanitizeQuery,
  type SearchFeedParams,
} from "@/lib/search-results";
import { fetchSearchChunk, searchWithPostgres } from "./search-query";

export type SearchFeedChunk = {
  /** The rendered tiles, or null when there is nothing more to show. */
  node: React.ReactNode;
  /** Tiles actually rendered — 0 is legitimate (every row hidden from this shopper). */
  count: number;
  /** Where the NEXT request starts. Always moves forward. */
  nextOffset: number;
  /** Whether asking again is worth it. */
  hasMore: boolean;
};

/**
 * One more page of search results, RENDERED.
 *
 * This is a public POST endpoint — every argument is attacker-controlled, so it
 * re-applies the same clamps the page applies to its query string (`offset` to
 * the same 320-result cap the numbered pager had, facet values quoted, sort
 * allowlisted). It returns a React node rather than rows so the grid keeps going
 * through ProductGrid: per-account visibility, contract prices and member prices
 * are applied there, on the server, exactly as they are on the first page.
 *
 * The caller pages on `nextOffset`, never on `count`: a chunk can render fewer
 * tiles than it consumed (rows hidden from this shopper, or dropped for having
 * no usable price) and paging on the rendered count would re-fetch them.
 */
export async function loadMoreSearchResults(
  params: SearchFeedParams,
  offset: number
): Promise<SearchFeedChunk> {
  const start = clampOffset(offset);
  const stop: SearchFeedChunk = { node: null, count: 0, nextOffset: start, hasMore: false };

  const query = sanitizeQuery(params?.q);
  if (!query || start >= MAX_RESULTS) return stop;

  const limit = Math.min(PER_PAGE, MAX_RESULTS - start);
  if (limit <= 0) return stop;

  // Meilisearch first; `null` means it is unavailable, and the feed falls back
  // to the same Postgres scan the first page falls back to rather than stopping
  // dead half way down a result list.
  const chunk =
    (await fetchSearchChunk(query, { offset: start, limit, params })) ??
    (await searchWithPostgres(query, { offset: start, limit }));

  const nextOffset = Math.min(MAX_RESULTS, start + Math.max(0, chunk.consumed));
  const hasMore = !chunk.exhausted && nextOffset > start && nextOffset < MAX_RESULTS;

  if (chunk.products.length === 0) return { node: null, count: 0, nextOffset, hasMore };

  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");

  return {
    node: (
      <ProductGrid
        products={chunk.products}
        memberPricingAvailable={memberPricingEnabled}
        {...(await getListingPricing(chunk.products))}
        listId="search_results"
        listName="Search Results"
        // Joins the page's existing grid instead of starting a second one.
        wrapperClassName="contents"
        indexOffset={start}
        renderEmpty={false}
      />
    ),
    count: chunk.products.length,
    nextOffset,
    hasMore,
  };
}
