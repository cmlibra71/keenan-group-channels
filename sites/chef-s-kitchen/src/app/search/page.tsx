import { unstable_cache } from "next/cache";
import { getProducts, getFeatureFlag, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchTypeahead } from "@/components/search/SearchTypeahead";
import { FacetRail, FacetChips, SortSelect, type FacetGroupDef } from "@/components/category/FilterRail";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Search",
};

const PER_PAGE = 40;
// Mirrors the category page's cap. `page` was previously unbounded, so
// `offset = (page - 1) * 40` let anyone page straight through the catalogue.
const MAX_PAGES = 8;
const PRICE_KEYS = ["lt1000", "1000to3000", "gt3000"] as const;
const PRICE_LABELS: Record<string, string> = {
  lt1000: "Under $1,000",
  "1000to3000": "$1,000–$3,000",
  gt3000: "$3,000+",
};
const SEARCH_SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
  { value: "newest", label: "Newest" },
];
const SORT_MAP: Record<string, string[] | undefined> = {
  price_asc: ["price:asc"],
  price_desc: ["price:desc"],
  newest: ["createdAt:desc"],
};

type Product = {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
};
type SearchResult = {
  products: Product[];
  total: number;
  groups: FacetGroupDef[];
};

// Multi-select params are comma-joined; brand/category facet *values* are
// percent-encoded names (names can contain commas), so split first, decode after.
const parseMulti = (v?: string) => v?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
const decVal = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};
// Meili string literal with escaped backslashes/quotes.
const meiliStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const bandExpr = (k: string) =>
  k === "lt1000" ? "price < 1000" : k === "1000to3000" ? "(price >= 1000 AND price <= 3000)" : "price > 3000";

async function searchWithMeilisearch(
  query: string,
  page: number,
  brandVals: string[],
  categoryVals: string[],
  priceVals: string[],
  sortKey: string
): Promise<SearchResult | null> {
  try {
    const { searchProducts } = await import("@keenan/services/search");

    const brandNames = brandVals.map(decVal);
    const categoryNames = categoryVals.map(decVal);

    const brandClause = brandNames.length ? `brandName IN [${brandNames.map(meiliStr).join(", ")}]` : null;
    const categoryClause = categoryNames.length ? `categoryNames IN [${categoryNames.map(meiliStr).join(", ")}]` : null;
    const priceClause = priceVals.length ? `(${priceVals.map(bandExpr).join(" OR ")})` : null;
    const and = (...cs: (string | null)[]) => {
      const f = cs.filter(Boolean) as string[];
      return f.length ? f : undefined;
    };

    const sort = SORT_MAP[sortKey];

    // One results query (all filters) plus disjunctive facet queries (each group
    // counted with its own filter removed, like the category page) — so picking
    // one brand doesn't zero the others. All run in parallel.
    const [main, brandRes, catRes, ...priceCounts] = await Promise.all([
      searchProducts(CHANNEL_ID, query, {
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
        filter: and(brandClause, categoryClause, priceClause),
        sort,
      }),
      searchProducts(CHANNEL_ID, query, {
        limit: 0,
        filter: and(categoryClause, priceClause),
        facets: ["brandName"],
      }),
      searchProducts(CHANNEL_ID, query, {
        limit: 0,
        filter: and(brandClause, priceClause),
        facets: ["categoryNames"],
      }),
      ...PRICE_KEYS.map((k) =>
        searchProducts(CHANNEL_ID, query, { limit: 0, filter: and(brandClause, categoryClause, bandExpr(k)) })
      ),
    ]);

    // Member-only pricing channels suppress the shared catalog sale price.
    const suppressSale = await shouldSuppressCatalogSalePrice();
    const products: Product[] = main.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      urlPath: hit.urlPath,
      price: String(hit.price),
      salePrice: !suppressSale && hit.salePrice ? String(hit.salePrice) : null,
      thumbnailImage: hit.thumbnailUrl ? { urlStandard: hit.thumbnailUrl, urlThumbnail: hit.thumbnailUrl } : null,
    }));

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

    return { products, total: main.estimatedTotalHits, groups };
  } catch {
    return null; // Meilisearch unavailable — caller will fall back
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
  async (query: string, page: number): Promise<SearchResult> => {
    const results = await getProducts({ search: query, limit: PER_PAGE, page });
    return { products: results.products, total: results.total, groups: [] };
  },
  ["search-pg-fallback", String(CHANNEL_ID)],
  { revalidate: 300, tags: ["search-fallback"] }
);

async function searchWithPostgres(query: string, page: number): Promise<SearchResult> {
  // Very short queries match almost everything and are the cheapest way to
  // enumerate the catalogue through the fallback.
  if (query.length < 3) return { products: [], total: 0, groups: [] };
  return cachedPostgresSearch(query.toLowerCase(), page);
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
  const page = Math.min(MAX_PAGES, Math.max(1, parseInt(sp.page || "1", 10) || 1));

  const brandVals = parseMulti(sp.brand);
  const categoryVals = parseMulti(sp.category);
  const priceVals = parseMulti(sp.price).filter((k) => (PRICE_KEYS as readonly string[]).includes(k));
  const sortKey = sp.sort ?? "relevance";
  const hasFilters = brandVals.length > 0 || categoryVals.length > 0 || priceVals.length > 0;

  let results: SearchResult | null = null;
  if (query) {
    results = await searchWithMeilisearch(query, page, brandVals, categoryVals, priceVals, sortKey);
    if (!results) results = await searchWithPostgres(query, page);
  }

  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  const groups = results?.groups ?? [];
  const showRail = groups.length > 0;
  // Capped too, so the pager never offers a page the route will refuse to serve.
  const totalPages = Math.min(MAX_PAGES, results ? Math.ceil(results.total / PER_PAGE) : 0);

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
                    {totalPages > 1 && <span className="ml-1">(page {page} of {totalPages})</span>}
                  </p>
                  {showRail && <FacetChips groups={groups} />}
                </div>
                {showRail && <SortSelect options={SEARCH_SORT_OPTIONS} />}
              </div>

              <ProductGrid
                products={results.products}
                memberPricingAvailable={memberPricingEnabled}
                {...(await getListingPricing(results.products))}
                listId="search_results"
                listName="Search Results"
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-2">
                  {page > 1 ? (
                    <Link
                      href={pageHref(page - 1)}
                      className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-text-body bg-white border border-border hover:bg-surface-primary transition-colors duration-300"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-text-muted bg-white border border-border cursor-not-allowed">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  )}

                  {/* Page numbers */}
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <Link
                          key={pageNum}
                          href={pageHref(pageNum)}
                          className={`px-3 py-2 text-sm font-medium transition-colors duration-300 ${
                            pageNum === page
                              ? "bg-surface-dark text-white"
                              : "text-text-body hover:bg-surface-secondary"
                          }`}
                        >
                          {pageNum}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Mobile page indicator */}
                  <span className="sm:hidden text-sm text-text-secondary">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <Link
                      href={pageHref(page + 1)}
                      className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-text-body bg-white border border-border hover:bg-surface-primary transition-colors duration-300"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-text-muted bg-white border border-border cursor-not-allowed">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </nav>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
