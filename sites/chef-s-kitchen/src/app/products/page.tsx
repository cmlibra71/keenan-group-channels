import { getProducts, getFeatureFlag } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import Link from "next/link";

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

const filters = [
  { key: "all", label: "All Products", href: "/products" },
  { key: "featured", label: "Featured", href: "/products?filter=featured" },
  { key: "sale", label: "On Sale", href: "/products?filter=sale" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

export const metadata = {
  title: "Products",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const activeFilter: FilterKey = filters.some((f) => f.key === params.filter)
    ? (params.filter as FilterKey)
    : "all";

  const fetchOptions: Parameters<typeof getProducts>[0] = { page, limit: 24 };
  if (activeFilter === "featured") fetchOptions.featured = true;
  if (activeFilter === "sale") fetchOptions.onSale = true;

  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts(fetchOptions),
    getFeatureFlag("member_pricing_enabled"),
  ]);
  const totalPages = Math.ceil(total / 24);

  const filterParam = activeFilter !== "all" ? `&filter=${activeFilter}` : "";
  const pageTitle = filters.find((f) => f.key === activeFilter)?.label || "All Products";

  return (
    <div className="container-page section-padding">
      <p className="eyebrow mb-3">CATALOGUE</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-6">{pageTitle}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
              activeFilter === f.key
                ? "bg-surface-dark text-white"
                : "bg-surface-secondary text-text-secondary hover:bg-stone-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="text-text-secondary text-center section-padding">No products found.</p>
      ) : (
        <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-2">
          {page > 1 && (
            <a href={`/products?page=${page - 1}${filterParam}`} className="px-3 py-2 text-sm font-medium bg-surface-secondary text-text-secondary hover:bg-stone-200 transition-colors duration-300">
              Previous
            </a>
          )}

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-text-muted">...</span>
            ) : (
              <a
                key={p}
                href={`/products?page=${p}${filterParam}`}
                className={`px-4 py-2 text-sm font-medium transition-colors duration-300 ${
                  p === page
                    ? "bg-surface-dark text-white"
                    : "bg-surface-secondary text-text-secondary hover:bg-stone-200"
                }`}
              >
                {p}
              </a>
            )
          )}

          {page < totalPages && (
            <a href={`/products?page=${page + 1}${filterParam}`} className="px-3 py-2 text-sm font-medium bg-surface-secondary text-text-secondary hover:bg-stone-200 transition-colors duration-300">
              Next
            </a>
          )}
        </div>
      )}
    </div>
  );
}
