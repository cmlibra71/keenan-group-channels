import Link from "next/link";
import { getProducts, getFeatureFlag, getSubcategories } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";

const CLEARANCE_ROOT_ID = 233;
const PRODUCTS_PER_PAGE = 24;

export const metadata = {
  title: "Clearance",
  description: "Shop our clearance items at reduced prices.",
};

type FilterOption = { id: number; name: string; slug: string };

export default async function ClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { page: pageParam, type } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10));

  // Only show the 3 subtypes (Warehouse Clearance, Special Offer, Scratch & Dent).
  // The parent "Clearance Sale" category is effectively an umbrella applied to
  // every clearance item, so listing it alongside "All Clearance" would be redundant.
  const filterOptions = (await getSubcategories(CLEARANCE_ROOT_ID)) as FilterOption[];

  const activeFilter = filterOptions.find((f) => f.slug === type) ?? null;

  const fetchOptions: Parameters<typeof getProducts>[0] = {
    page: currentPage,
    limit: PRODUCTS_PER_PAGE,
  };
  if (activeFilter) {
    fetchOptions.categoryId = activeFilter.id;
  } else {
    fetchOptions.onSale = true;
  }

  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts(fetchOptions),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);
  const heading = activeFilter?.name ?? "Clearance";
  const typeParam = type ? `type=${encodeURIComponent(type)}&` : "";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">{heading}</h1>
        <p className="mt-2 text-zinc-500">
          {total} {total === 1 ? "item" : "items"}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-60 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide mb-3">Filter by Type</h2>
          <ul className="space-y-1">
            <li>
              <Link
                href="/clearance"
                className={`block px-3 py-2 text-sm rounded transition-colors ${
                  !activeFilter
                    ? "bg-zinc-900 text-white font-medium"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                All Clearance
              </Link>
            </li>
            {filterOptions.map((opt) => (
              <li key={opt.id}>
                <Link
                  href={`/clearance?type=${encodeURIComponent(opt.slug)}`}
                  className={`block px-3 py-2 text-sm rounded transition-colors ${
                    activeFilter?.id === opt.id
                      ? "bg-zinc-900 text-white font-medium"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {opt.name}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1 min-w-0">
          {products.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">
              No clearance items {activeFilter ? `in ${activeFilter.name}` : ""}. Check back soon!
            </p>
          ) : (
            <>
              <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} />

              {totalPages > 1 && (
                <nav className="mt-10 flex flex-wrap items-center justify-center gap-2">
                  {currentPage > 1 && (
                    <Link
                      href={`/clearance?${typeParam}page=${currentPage - 1}`}
                      className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded hover:bg-zinc-100 transition-colors"
                    >
                      Previous
                    </Link>
                  )}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={`/clearance?${typeParam}page=${p}`}
                      className={`px-3.5 py-2 text-sm font-medium rounded transition-colors ${
                        p === currentPage
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-300 hover:bg-zinc-100"
                      }`}
                    >
                      {p}
                    </Link>
                  ))}
                  {currentPage < totalPages && (
                    <Link
                      href={`/clearance?${typeParam}page=${currentPage + 1}`}
                      className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded hover:bg-zinc-100 transition-colors"
                    >
                      Next
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
