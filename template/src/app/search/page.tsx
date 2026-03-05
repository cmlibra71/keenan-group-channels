import { getProducts, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchTypeahead } from "@/components/search/SearchTypeahead";
import Link from "next/link";

export const metadata = {
  title: "Search",
};

interface FacetDistribution {
  [key: string]: Record<string, number>;
}

async function searchWithMeilisearch(
  query: string,
  brand?: string,
  category?: string
) {
  try {
    const { searchProducts } = await import("@keenan/services/search");

    const filters: string[] = [];
    if (brand) filters.push(`brandName = "${brand}"`);
    if (category) filters.push(`categoryNames = "${category}"`);

    const result = await searchProducts(CHANNEL_ID, query, {
      limit: 40,
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

async function searchWithPostgres(query: string) {
  const results = await getProducts({ search: query, limit: 40 });
  return {
    products: results.products,
    total: results.total,
    facets: undefined as FacetDistribution | undefined,
    source: "postgres" as const,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; category?: string }>;
}) {
  const { q, brand, category } = await searchParams;
  const query = q?.trim() || "";

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
    results = await searchWithMeilisearch(query, brand, category);
    if (!results) {
      results = await searchWithPostgres(query);
    }
  }

  const activeBrands = results?.facets?.brandName;
  const activeCategories = results?.facets?.categoryNames;
  const hasFacets = activeBrands || activeCategories;

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
                href={`/search?q=${encodeURIComponent(query)}`}
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
                          href={`/search?q=${encodeURIComponent(query)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200"
                        >
                          {brand} &times;
                        </Link>
                      )}
                      {category && (
                        <Link
                          href={`/search?q=${encodeURIComponent(query)}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`}
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
                              href={`/search?q=${encodeURIComponent(query)}&brand=${encodeURIComponent(name)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
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
                              href={`/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(name)}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`}
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
              </p>
              <ProductGrid products={results.products} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
