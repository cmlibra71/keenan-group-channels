import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { getCategoryBySlug, getProducts, getSubcategories, getCategoryStats, getCategoryBreadcrumbs } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { RichContent } from "@/components/content/RichContent";
import { Price } from "@/components/ui/Price";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const [{ products }, subcategories, stats, breadcrumbs] = await Promise.all([
    getProducts({ categoryId: category.id, limit: 24 }),
    getSubcategories(category.id),
    getCategoryStats(category.id),
    getCategoryBreadcrumbs(category.pathIds || []),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/categories" className="hover:text-zinc-600">Categories</Link>
        {breadcrumbs.slice(0, -1).map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
          </span>
        ))}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-zinc-700">{category.name}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-zinc-50 rounded-2xl overflow-hidden">
        {category.imageUrl && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 flex items-center justify-center">
            <img
              src={category.imageUrl}
              alt={category.name}
              className="w-full h-auto object-contain"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${category.imageUrl ? "" : "pl-8"}`}>
          <h1 className="text-3xl font-bold text-zinc-900">{category.name}</h1>

          {category.description && (
            <RichContent
              html={category.description}
              stripStyles
              className="mt-3 text-zinc-600 leading-relaxed prose prose-sm prose-zinc"
            />
          )}

          {/* Stats */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500">
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
              {stats.brands.slice(0, 12).map((brand) => (
                <span
                  key={brand}
                  className="px-3 py-1 rounded-full bg-white text-xs font-medium text-zinc-600 border border-zinc-200"
                >
                  {brand}
                </span>
              ))}
              {stats.brands.length > 12 && (
                <span className="px-3 py-1 text-xs text-zinc-400">+{stats.brands.length - 12} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subcategories */}
      {subcategories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Subcategories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {subcategories.map((sub) => (
              <Link
                key={sub.id}
                href={`/categories/${sub.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 hover:shadow-sm transition-all"
              >
                {sub.imageUrl ? (
                  <img
                    src={sub.imageUrl}
                    alt={sub.name}
                    className="h-12 w-12 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Package className="h-5 w-5 text-zinc-300" />
                  </div>
                )}
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 line-clamp-2">
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
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Products</h2>
          <ProductGrid products={products} />
        </div>
      )}

      {products.length === 0 && subcategories.length === 0 && (
        <p className="text-zinc-500 text-center py-12">No products in this category yet.</p>
      )}
    </div>
  );
}
