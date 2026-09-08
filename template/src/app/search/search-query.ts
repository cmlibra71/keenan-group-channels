import { unstable_cache } from "next/cache";
import { dropRemovedCategoryNames } from "@keenan/services";
import {
  CHANNEL_ID,
  getProducts,
  getRemovedCategoryNames,
  shouldSuppressCatalogSalePrice,
} from "@/lib/store";
import {
  SORT_MAP,
  andFilters,
  buildFilterClauses,
  sanitizeFacetValues,
  sanitizePriceKeys,
  sanitizeSortKey,
  type SearchFeedParams,
} from "@/lib/search-results";

/** The fields a result tile needs. Deliberately narrow — see /api/search. */
export type SearchProduct = {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
};

export type SearchChunk = {
  products: SearchProduct[];
  /** The source's own count for the whole result set, not this chunk. */
  total: number;
  /**
   * Result POSITIONS this chunk consumed — what the next offset is built from.
   * Not `products.length`: both sources drop rows after the window is chosen
   * (Meilisearch never does, the Postgres path does when a row has no usable
   * price), and paging off the rendered count would then re-fetch what was just
   * skipped.
   */
  consumed: number;
  /** The source has nothing after this chunk. */
  exhausted: boolean;
};

/**
 * The one place the URL/action parameters become Meilisearch arguments.
 *
 * Async because of ONE thing: a category REMOVED from this storefront
 * (`hidden_category_ids`, card ZVbjSoKN) is not a browsable filter. The removal
 * is resolved by ID everywhere else, but Meilisearch's `categoryNames` facet is
 * keyed by NAME and the index knows nothing about the setting — so a hand-typed
 * `?category=Chefs+Hat+Sydney` would still filter the results of a shelf whose
 * own page 404s. Dropped here, in the one place, so the rail, the first render,
 * the scroll loads and the active-filter chips cannot disagree.
 */
export async function resolveFeedFilters(params: SearchFeedParams) {
  const brandValues = sanitizeFacetValues(params.brand);
  const categoryValues = dropRemovedCategoryNames(
    sanitizeFacetValues(params.category),
    await getRemovedCategoryNames(),
    (v) => v
  );
  const priceKeys = sanitizePriceKeys(params.price);
  const clauses = buildFilterClauses({ brandValues, categoryValues, priceKeys });
  return {
    brandValues,
    categoryValues,
    priceKeys,
    ...clauses,
    sortKey: sanitizeSortKey(params.sort),
  };
}

/**
 * One slice of the result set, from the channel's Meilisearch index.
 *
 * `null` means Meilisearch is unavailable — the caller falls back (first render)
 * or stops the feed (scroll load). Channel scoping is the index itself
 * (`CHANNEL_ID`); per-account VISIBILITY and prices are applied downstream in
 * ProductGrid at render time, never here and never in the index.
 */
export async function fetchSearchChunk(
  query: string,
  opts: {
    offset: number;
    limit: number;
    params: SearchFeedParams;
  }
): Promise<SearchChunk | null> {
  if (!query || opts.limit <= 0) return { products: [], total: 0, consumed: 0, exhausted: true };

  try {
    const { searchProducts } = await import("@keenan/services/search");
    const { brandClause, categoryClause, priceClause, sortKey } = await resolveFeedFilters(
      opts.params
    );

    const result = await searchProducts(CHANNEL_ID, query, {
      limit: opts.limit,
      offset: opts.offset,
      filter: andFilters(brandClause, categoryClause, priceClause),
      sort: SORT_MAP[sortKey],
    });

    // Member-only pricing channels suppress the shared catalog sale price.
    const suppressSale = await shouldSuppressCatalogSalePrice();
    const consumed = result.hits.length;
    return {
      consumed,
      exhausted: consumed < opts.limit || opts.offset + consumed >= result.estimatedTotalHits,
      products: result.hits.map((hit) => ({
        id: hit.id,
        name: hit.name,
        urlPath: hit.urlPath,
        price: String(hit.price),
        salePrice: !suppressSale && hit.salePrice ? String(hit.salePrice) : null,
        thumbnailImage: hit.thumbnailUrl
          ? { urlStandard: hit.thumbnailUrl, urlThumbnail: hit.thumbnailUrl }
          : null,
      })),
      total: result.estimatedTotalHits,
    };
  } catch {
    return null; // Meilisearch unavailable — caller decides what to do
  }
}

/**
 * The Meilisearch outage path — an UNCACHED full-text scan of the shared
 * commerce database. Without a cache in front, a flood of distinct `?q=` values
 * while Meili is down degrades straight into expensive DB queries, so a search
 * outage becomes a database outage.
 *
 * Safe to cache: these rows are the SHARED, unscoped set — per-account
 * visibility and pricing are applied downstream in ProductGrid at render time
 * (the same contract as category_listing_cache and the Meili index).
 */
const cachedPostgresSearch = unstable_cache(
  async (query: string, limit: number, page: number) => {
    const results = await getProducts({ search: query, limit, page });
    return { products: results.products, total: results.total };
  },
  ["search-pg-fallback", String(CHANNEL_ID)],
  { revalidate: 300, tags: ["search-fallback"] }
);

/**
 * The same window as `fetchSearchChunk`, from Postgres. `offset` must be a
 * multiple of `limit` — it always is, because every chunk consumes a whole
 * window (see `consumed`).
 */
export async function searchWithPostgres(
  query: string,
  opts: { offset: number; limit: number }
): Promise<SearchChunk> {
  // Very short queries match almost everything and are the cheapest way to
  // enumerate the catalogue through the fallback.
  if (query.length < 3 || opts.limit <= 0) {
    return { products: [], total: 0, consumed: 0, exhausted: true };
  }
  const page = Math.floor(opts.offset / opts.limit) + 1;
  const { products, total } = await cachedPostgresSearch(query.toLowerCase(), opts.limit, page);
  return {
    products,
    total,
    // The WINDOW, not the rows returned: sanitizeCatalogProducts drops rows
    // (no usable price) after the database has already applied the limit.
    consumed: Math.min(opts.limit, Math.max(0, total - opts.offset)),
    exhausted: opts.offset + opts.limit >= total,
  };
}
