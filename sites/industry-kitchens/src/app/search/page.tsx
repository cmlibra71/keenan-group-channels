import { getProducts } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchInput } from "@/components/search/SearchInput";

export const metadata = {
  title: "Search",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() || "";

  const results = query
    ? await getProducts({ search: query, limit: 40 })
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Search</h1>

      <SearchInput defaultValue={query} />

      <div className="mt-8">
        {!query && (
          <div className="text-center py-16">
            <p className="text-zinc-500">Enter a search term to find products.</p>
          </div>
        )}

        {query && results && results.products.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500">
              No products found for &ldquo;{query}&rdquo;.
            </p>
          </div>
        )}

        {results && results.products.length > 0 && (
          <>
            <p className="text-sm text-zinc-500 mb-4">
              {results.products.length} result{results.products.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>
            <ProductGrid products={results.products} />
          </>
        )}
      </div>
    </div>
  );
}
