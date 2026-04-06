import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Package } from "lucide-react";
import { getCategoryBySlug, getProducts, getSubcategories, getCategoryStats, getCategoryBreadcrumbs, getFeatureFlag, getChannelSetting } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { RichContent } from "@/components/content/RichContent";
import { Price } from "@/components/ui/Price";

const PRODUCTS_PER_PAGE = 24;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10));
  const category = await getCategoryBySlug(slug);

  if (!category) {
    // Check for redirect from old category structure
    const redirects = await getChannelSetting("category_redirects");
    if (redirects && typeof redirects === "object" && !Array.isArray(redirects)) {
      const newSlug = (redirects as Record<string, string>)[slug];
      if (newSlug) {
        redirect(`/categories/${newSlug}`);
      }
    }
    notFound();
  }

  const [{ products, total }, subcategories, stats, breadcrumbs, memberPricingEnabled] = await Promise.all([
    getProducts({ categoryId: category.id, limit: PRODUCTS_PER_PAGE, page: currentPage }),
    getSubcategories(category.id),
    getCategoryStats(category.id),
    getCategoryBreadcrumbs(category.pathIds || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const totalPages = Math.ceil((total ?? products.length) / PRODUCTS_PER_PAGE);

  return (
    <div className="container-page section-padding">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted mb-6">
        <Link href="/categories" className="hover:text-text-secondary transition-colors duration-300">Categories</Link>
        {breadcrumbs.slice(0, -1).map((crumb: { id: number; name: string; slug: string }) => (
          <span key={crumb.id} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/categories/${crumb.slug}`} className="hover:text-text-secondary transition-colors duration-300">{crumb.name}</Link>
          </span>
        ))}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text-body">{category.name}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-surface-primary overflow-hidden">
        {category.imageUrl && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white m-3 p-6 relative min-h-[200px]">
            <Image
              src={category.imageUrl}
              alt={category.name}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-6"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${category.imageUrl ? "" : "pl-8"}`}>
          <h1 className="text-3xl heading-serif text-text-primary">{category.name}</h1>

          {category.description && (
            <RichContent
              html={category.description}
              stripStyles
              className="mt-3 text-text-secondary leading-relaxed prose prose-sm prose-zinc"
            />
          )}

          {/* Stats */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-secondary">
            <span>{stats.productCount} {stats.productCount === 1 ? "product" : "products"}</span>
            {stats.minPrice > 0 && stats.maxPrice > 0 && (
              <span>
                <Price amount={stats.minPrice} /> &ndash; <Price amount={stats.maxPrice} />
              </span>
            )}
            {stats.brands.length > 0 && (
              <span>{stats.brands.length} {stats.brands.length === 1 ? "brand" : "brands"}</span>
            )}
          </div>

          {/* Brand pills */}
          {stats.brands.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {stats.brands.slice(0, 12).map((brand: string) => (
                <span
                  key={brand}
                  className="px-3 py-1 rounded-full bg-white text-xs font-medium text-text-secondary border border-border"
                >
                  {brand}
                </span>
              ))}
              {stats.brands.length > 12 && (
                <span className="px-3 py-1 text-xs text-text-muted">+{stats.brands.length - 12} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subcategories */}
      {subcategories.length > 0 && (
        <div className="mb-10">
          <p className="eyebrow mb-3">EXPLORE</p>
          <h2 className="panel-title mb-4">Subcategories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {subcategories.map((sub: { id: number; name: string; slug: string; imageUrl?: string | null }) => (
              <Link
                key={sub.id}
                href={`/categories/${sub.slug}`}
                className="group flex items-center gap-3 border border-border p-3 hover:border-text-primary/30 hover:shadow-sm transition-all duration-300"
              >
                {sub.imageUrl ? (
                  <div className="relative h-12 w-12 flex-shrink-0">
                    <Image
                      src={sub.imageUrl}
                      alt={sub.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-12 w-12 bg-surface-secondary flex items-center justify-center flex-shrink-0">
                    <Package className="h-5 w-5 text-text-muted" />
                  </div>
                )}
                <span className="text-sm font-medium text-text-body group-hover:text-text-primary line-clamp-2 transition-colors duration-300">
                  {sub.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      {products.length > 0 && (
        <div>
          <p className="eyebrow mb-3">PRODUCTS</p>
          <h2 className="panel-title mb-4">Products</h2>
          <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} />

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/categories/${slug}?page=${currentPage - 1}`}
                  className="px-4 py-2 text-sm font-medium border border-border rounded hover:bg-surface-secondary transition-colors"
                >
                  Previous
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/categories/${slug}?page=${p}`}
                  className={`px-3.5 py-2 text-sm font-medium rounded transition-colors ${
                    p === currentPage
                      ? "bg-zinc-900 text-white"
                      : "border border-border hover:bg-surface-secondary"
                  }`}
                >
                  {p}
                </Link>
              ))}
              {currentPage < totalPages && (
                <Link
                  href={`/categories/${slug}?page=${currentPage + 1}`}
                  className="px-4 py-2 text-sm font-medium border border-border rounded hover:bg-surface-secondary transition-colors"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      )}

      {products.length === 0 && subcategories.length === 0 && (
        <p className="text-text-secondary text-center py-12">No products in this category yet.</p>
      )}
    </div>
  );
}
