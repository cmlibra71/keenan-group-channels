import { getProducts, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchTypeahead } from "@/components/search/SearchTypeahead";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Search",
};

const PER_PAGE = 40;

interface FacetDistribution {
  [key: string]: Record<string, number>;
}

async function searchWithMeilisearch(
  query: string,
  page: number,
  brand?: string,
  category?: string
) {
  try {
    const { searchProducts } = await import("@keenan/services/search");

    const filters: string[] = [];
    if (brand) filters.push(`brandName = "${brand}"`);
    if (category) filters.push(`categoryNames = "${category}"`);

    const result = await searchProducts(CHANNEL_ID, query, {
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
      filter: filters.length > 0 ? filters : undefined,
      facets: ["brandName", "categoryNames"],
    });

    // Map Meilisearch hits to ProductWithImage shape for ProductGrid
    const products = result.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      urlPath: hit.urlPath,
      price: String(hit.price),
      salePrice: hit.salePrice ? String(hit.salePrice) : null,
      thumbnailImage: hit.thumbnailUrl
        ? { urlStandard: hit.thumbnailUrl, urlThumbnail: hit.thumbnailUrl }
        : null,
    }));

    return {
      products,
      total: result.estimatedTotalHits,
      facets: result.facetDistribution as FacetDistribution | undefined,
      source: "meilisearch" as const,
    };
  } catch {
    return null; // Meilisearch unavailable — caller will fall back
  }
}

async function searchWithPostgres(query: string, page: number) {
  const results = await getProducts({
    search: query,
    limit: PER_PAGE,
    page,
  });
  return {
    products: results.products,
    total: results.total,
    facets: undefined as FacetDistribution | undefined,
    source: "postgres" as const,
  };
}

function buildSearchUrl(params: {
  q: string;
  page?: number;
  brand?: string;
  category?: string;
}) {
  const sp = new URLSearchParams();
  sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  if (params.brand) sp.set("brand", params.brand);
  if (params.category) sp.set("category", params.category);
  return `/search?${sp.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; category?: string; page?: string }>;
}) {
  const { q, brand, category, page: pageParam } = await searchParams;
  const query = q?.trim() || "";
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  let results: {
    products: Array<{
      id: number;
      name: string;
      urlPath: string | null;
      price: string;
      salePrice: string | null;
      thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
    }>;
    total: number;
    facets?: FacetDistribution;
    source: "meilisearch" | "postgres";
  } | null = null;

  if (query) {
    // Try Meilisearch first, fall back to Postgres
    results = await searchWithMeilisearch(query, page, brand, category);
    if (!results) {
      results = await searchWithPostgres(query, page);
    }
  }

  const activeBrands = results?.facets?.brandName;
  const activeCategories = results?.facets?.categoryNames;
  const hasFacets = activeBrands || activeCategories;

  const totalPages = results ? Math.ceil(results.total / PER_PAGE) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Search</h1>

      <SearchTypeahead defaultValue={query} />

      <div className="mt-8">
        {!query && (
          <div className="text-center py-16">
            <p className="text-zinc-500">
              Enter a search term to find products.
            </p>
          </div>
        )}

        {query && results && results.products.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500">
              No products found for &ldquo;{query}&rdquo;
              {brand && <> in brand &ldquo;{brand}&rdquo;</>}
              {category && <> in category &ldquo;{category}&rdquo;</>}.
            </p>
            {(brand || category) && (
              <Link
                href={buildSearchUrl({ q: query })}
                className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
              >
                Clear filters
              </Link>
            )}
          </div>
        )}

        {results && results.products.length > 0 && (
          <div className={hasFacets ? "flex gap-8" : ""}>
            {/* Facet Sidebar */}
            {hasFacets && (
              <aside className="hidden lg:block w-56 flex-shrink-0">
                {/* Active Filters */}
                {(brand || category) && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                      Active Filters
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {brand && (
                        <Link
                          href={buildSearchUrl({ q: query, category })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200"
                        >
                          {brand} &times;
                        </Link>
                      )}
                      {category && (
                        <Link
                          href={buildSearchUrl({ q: query, brand })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200"
                        >
                          {category} &times;
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* Brand Facets */}
                {activeBrands && Object.keys(activeBrands).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                      Brand
                    </h3>
                    <ul className="space-y-1">
                      {Object.entries(activeBrands)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => (
                          <li key={name}>
                            <Link
                              href={buildSearchUrl({ q: query, brand: name, category })}
                              className={`flex items-center justify-between text-sm py-0.5 ${
                                brand === name
                                  ? "font-medium text-zinc-900"
                                  : "text-zinc-600 hover:text-zinc-900"
                              }`}
                            >
                              <span className="truncate">{name}</span>
                              <span className="text-xs text-zinc-400 ml-2">
                                {count}
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Category Facets */}
                {activeCategories && Object.keys(activeCategories).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                      Category
                    </h3>
                    <ul className="space-y-1">
                      {Object.entries(activeCategories)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => (
                          <li key={name}>
                            <Link
                              href={buildSearchUrl({ q: query, brand, category: name })}
                              className={`flex items-center justify-between text-sm py-0.5 ${
                                category === name
                                  ? "font-medium text-zinc-900"
                                  : "text-zinc-600 hover:text-zinc-900"
                              }`}
                            >
                              <span className="truncate">{name}</span>
                              <span className="text-xs text-zinc-400 ml-2">
                                {count}
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </aside>
            )}

            {/* Results */}
            <div className="flex-1">
              <p className="text-sm text-zinc-500 mb-4">
                {results.total} result{results.total !== 1 ? "s" : ""} for
                &ldquo;{query}&rdquo;
                {brand && <> in <strong>{brand}</strong></>}
                {category && <> in <strong>{category}</strong></>}
                {totalPages > 1 && (
                  <span className="ml-1">(page {page} of {totalPages})</span>
                )}
              </p>
              <ProductGrid products={results.products} />

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-2">
                  {page > 1 ? (
                    <Link
                      href={buildSearchUrl({ q: query, page: page - 1, brand, category })}
                      className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-300 bg-white border border-zinc-200 rounded-lg cursor-not-allowed">
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
                          href={buildSearchUrl({ q: query, page: pageNum, brand, category })}
                          className={`px-3 py-2 text-sm font-medium rounded-lg ${
                            pageNum === page
                              ? "bg-zinc-900 text-white"
                              : "text-zinc-700 hover:bg-zinc-100"
                          }`}
                        >
                          {pageNum}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Mobile page indicator */}
                  <span className="sm:hidden text-sm text-zinc-500">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <Link
                      href={buildSearchUrl({ q: query, page: page + 1, brand, category })}
                      className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-300 bg-white border border-zinc-200 rounded-lg cursor-not-allowed">
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
