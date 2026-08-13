import { getFeatureFlag, CHANNEL_ID } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchTypeahead } from "@/components/search/SearchTypeahead";
import { SearchResultsFeed } from "@/components/search/SearchResultsFeed";
import { FacetRail, FacetChips, SortSelect, type FacetGroupDef } from "@/components/category/FilterRail";
import Link from "next/link";
import {
  MAX_PAGES,
  MAX_RESULTS,
  PER_PAGE,
  PRICE_KEYS,
  PRICE_LABELS,
  SEARCH_SORT_OPTIONS,
  andFilters,
  bandExpr,
  clampPage,
  type SearchFeedParams,
} from "@/lib/search-results";
import { fetchSearchChunk, resolveFeedFilters, searchWithPostgres, type SearchChunk } from "./search-query";
import { loadMoreSearchResults } from "./actions";

export const metadata = {
  title: "Search",
};

const GRID_CLASS = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

/**
 * Facet counts for the rail. Each group is counted with its OWN filter removed
 * (disjunctive facets, like the category page), so picking one brand doesn't
 * zero the others. Counted once, against the whole result set — they do not
 * move as the shopper scrolls further into the results.
 */
async function fetchFacetGroups(query: string, params: SearchFeedParams): Promise<FacetGroupDef[]> {
  try {
    const { searchProducts } = await import("@keenan/services/search");
    const { brandClause, categoryClause, priceClause } = resolveFeedFilters(params);

    const [brandRes, catRes, ...priceCounts] = await Promise.all([
      searchProducts(CHANNEL_ID, query, {
        limit: 0,
        filter: andFilters(categoryClause, priceClause),
        facets: ["brandName"],
      }),
      searchProducts(CHANNEL_ID, query, {
        limit: 0,
        filter: andFilters(brandClause, priceClause),
        facets: ["categoryNames"],
      }),
      ...PRICE_KEYS.map((k) =>
        searchProducts(CHANNEL_ID, query, {
          limit: 0,
          filter: andFilters(brandClause, categoryClause, bandExpr(k)),
        })
      ),
    ]);

    const toOptions = (dist?: Record<string, number>) =>
      Object.entries(dist ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([name, count]) => ({ value: encodeURIComponent(name), label: name, count }));

    const groups: FacetGroupDef[] = [];
    const catOpts = toOptions(catRes.facetDistribution?.categoryNames);
    if (catOpts.length) groups.push({ param: "category", title: "Category", options: catOpts });
    const brandOpts = toOptions(brandRes.facetDistribution?.brandName);
    if (brandOpts.length) groups.push({ param: "brand", title: "Brand", options: brandOpts });
    const priceOpts = PRICE_KEYS.map((k, i) => ({
      value: k,
      label: PRICE_LABELS[k],
      count: priceCounts[i].estimatedTotalHits,
    })).filter((o) => o.count > 0);
    if (priceOpts.length) groups.push({ param: "price", title: "Price (ex GST)", options: priceOpts });

    return groups;
  } catch {
    return []; // Meilisearch unavailable — the results fall back without a rail
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    category?: string;
    price?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() || "";
  // `?page=` is now only the no-JavaScript path: page N renders results
  // 1..N*PER_PAGE in one go, so following the fallback link never loses the
  // results already on screen. With JavaScript the feed appends instead.
  const page = clampPage(sp.page);

  const params: SearchFeedParams = {
    q: query,
    brand: sp.brand,
    category: sp.category,
    price: sp.price,
    sort: sp.sort,
  };
  const { brandValues, categoryValues, priceKeys, sortKey } = resolveFeedFilters(params);
  const hasFilters = brandValues.length > 0 || categoryValues.length > 0 || priceKeys.length > 0;

  // The first render is CUMULATIVE: `?page=N` (the no-JavaScript path) renders
  // results 1..N*PER_PAGE in one go, and with JavaScript the feed appends from
  // there.
  const firstWindow = PER_PAGE * page;
  let results: SearchChunk | null = null;
  let groups: FacetGroupDef[] = [];
  if (query) {
    const [chunk, facetGroups] = await Promise.all([
      fetchSearchChunk(query, { offset: 0, limit: firstWindow, params }),
      fetchFacetGroups(query, params),
    ]);
    results = chunk ?? (await searchWithPostgres(query, { offset: 0, limit: firstWindow }));
    groups = facetGroups;
  }

  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  const showRail = groups.length > 0;

  const pageHref = (n: number) => {
    const u = new URLSearchParams();
    u.set("q", query);
    if (sp.brand) u.set("brand", sp.brand);
    if (sp.category) u.set("category", sp.category);
    if (sp.price) u.set("price", sp.price);
    if (sp.sort) u.set("sort", sp.sort);
    if (n > 1) u.set("page", String(n));
    return `/search?${u.toString()}`;
  };
  const clearFiltersHref = `/search?q=${encodeURIComponent(query)}`;

  return (
    <div className="container-page section-padding">
      <p className="eyebrow mb-3">FIND</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-8">Search</h1>

      <SearchTypeahead defaultValue={query} />

      <div className="mt-8">
        {!query && (
          <div className="text-center section-padding">
            <p className="text-text-secondary">Enter a search term to find products.</p>
          </div>
        )}

        {query && results && results.products.length === 0 && (
          <div className="text-center section-padding">
            <p className="text-text-secondary">No products found for &ldquo;{query}&rdquo;.</p>
            {hasFilters && (
              <Link
                href={clearFiltersHref}
                className="mt-2 inline-block text-sm text-text-secondary underline hover:text-text-primary transition-colors duration-300"
              >
                Clear filters
              </Link>
            )}
          </div>
        )}

        {results && results.products.length > 0 && (
          <div className={showRail ? "flex gap-6" : ""}>
            {showRail && <FacetRail groups={groups} clearParams={["category", "brand", "price"]} />}

            <div className="min-w-0 flex-1">
              {/* Toolbar */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-text-secondary">
                    {results.total} result{results.total !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
                  </p>
                  {showRail && <FacetChips groups={groups} />}
                </div>
                {showRail && <SortSelect options={SEARCH_SORT_OPTIONS} />}
              </div>

              {/* Results feed: this first page is server-rendered; scrolling
                  appends further pages through the load-more server action. */}
              <SearchResultsFeed
                key={`${query}|${sp.brand ?? ""}|${sp.category ?? ""}|${sp.price ?? ""}|${sortKey}`}
                gridClassName={GRID_CLASS}
                params={params}
                loadMore={loadMoreSearchResults}
                initialOffset={results.consumed}
                initialHasMore={!results.exhausted && results.consumed < MAX_RESULTS}
                total={results.total}
                fallbackHref={pageHref(Math.min(MAX_PAGES, page + 1))}
              >
                <ProductGrid
                  products={results.products}
                  memberPricingAvailable={memberPricingEnabled}
                  {...(await getListingPricing(results.products))}
                  listId="search_results"
                  listName="Search Results"
                  wrapperClassName="contents"
                  renderEmpty={false}
                />
              </SearchResultsFeed>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
