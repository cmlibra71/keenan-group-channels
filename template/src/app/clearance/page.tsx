import Link from "next/link";
import type { CategoryChildSlim } from "@keenan/services";
import { getProducts, getFeatureFlag, getSubcategories, getSpecialProducts } from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";

const CLEARANCE_ROOT_ID = 233;
const PRODUCTS_PER_PAGE = 24;
/** Card tJ4audbu — the Partner Specials filter, and how many lead the unfiltered page. */
const SPECIALS_SLUG = "partner-specials";
const SPECIALS_LEAD = 8;

export const metadata = {
  title: "Clearance",
  description: "Shop our clearance items at reduced prices.",
};

// The rows `getSubcategories` returns, narrowed to what this page reads. Named
// rather than re-declared so it cannot drift from the seam: the service
// snake-cases its keys, and a hand-written camelCase shape here is what left
// the subcategory tiles blank on the category pages (card 7LjU5UDE).
type FilterOption = Pick<CategoryChildSlim, "id" | "name" | "slug">;

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
  const filterOptions: FilterOption[] = await getSubcategories(CLEARANCE_ROOT_ID);

  // PARTNER SPECIALS (card tJ4audbu): the products on a live special are this page's first
  // filter and lead its unfiltered first page — "the product appears on the specials / clearance
  // page", with nothing for staff to do beyond setting the special. Priced with it: the rows come
  // back with the special on them and ProductGrid runs the same per-shopper funnel as every grid.
  const specialsView = type === SPECIALS_SLUG;
  const activeFilter = specialsView ? null : filterOptions.find((f) => f.slug === type) ?? null;

  const fetchOptions: Parameters<typeof getProducts>[0] = {
    page: currentPage,
    limit: PRODUCTS_PER_PAGE,
  };
  if (activeFilter) {
    fetchOptions.categoryId = activeFilter.id;
  } else {
    fetchOptions.onSale = true;
  }

  type Listing = Awaited<ReturnType<typeof getProducts>>;
  const noSpecials = { products: [], total: 0 } as unknown as Listing;
  const [{ products, total }, memberPricingEnabled, specialsLead] = await Promise.all([
    specialsView
      ? (getSpecialProducts({ page: currentPage, limit: PRODUCTS_PER_PAGE }) as unknown as Promise<Listing>)
      : getProducts(fetchOptions),
    getFeatureFlag("member_pricing_enabled"),
    !specialsView && !activeFilter && currentPage === 1
      ? (getSpecialProducts({ page: 1, limit: SPECIALS_LEAD }) as unknown as Promise<Listing>).catch(() => noSpecials)
      : Promise.resolve(noSpecials),
  ]);

  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);
  const heading = specialsView ? "Partner Specials" : activeFilter?.name ?? "Clearance";
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
                  !activeFilter && !specialsView
                    ? "bg-zinc-900 text-white font-medium"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                All Clearance
              </Link>
            </li>
            <li>
              <Link
                href={`/clearance?type=${SPECIALS_SLUG}`}
                className={`block px-3 py-2 text-sm rounded transition-colors ${
                  specialsView
                    ? "bg-zinc-900 text-white font-medium"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Partner Specials
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
          {specialsLead.products.length > 0 && (
            <section className="mb-10" aria-label="Partner Specials">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">Partner Specials</h2>
                {specialsLead.total > specialsLead.products.length && (
                  <Link href={`/clearance?type=${SPECIALS_SLUG}`} className="text-sm font-medium text-zinc-700 hover:underline">
                    See all {specialsLead.total}
                  </Link>
                )}
              </div>
              <ProductGrid products={specialsLead.products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={await getListingMemberPrices(specialsLead.products)} listId="partner_specials" listName="Partner Specials" />
            </section>
          )}
          {products.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">
              {specialsView
                ? "No Partner Specials are running right now. Check back soon!"
                : <>No clearance items {activeFilter ? `in ${activeFilter.name}` : ""}. Check back soon!</>}
            </p>
          ) : (
            <>
              <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={await getListingMemberPrices(products)} listId="clearance" listName="Clearance" />

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
