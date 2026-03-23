import Link from "next/link";
import Image from "next/image";
import { getProducts, getSiteConfig, getCategories, getFeatureFlag } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, allCategories, memberPricingEnabled] = await Promise.all([
    getSiteConfig(),
    getProducts({ featured: true, limit: 8 }),
    getCategories(),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  // Top-level categories only
  const topCategories = allCategories.filter((c) => c.depth === 0).slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="bg-zinc-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Welcome to {channel?.name || "our store"}
          </h1>
          <p className="mt-4 text-lg text-zinc-300 max-w-xl">
            Discover our curated collection of quality products.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-block bg-white text-zinc-900 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-100 transition-colors"
          >
            Shop All Products
          </Link>
        </div>
      </section>

      {/* Categories */}
      {topCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-zinc-900">Shop by Category</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group block rounded-xl overflow-hidden bg-white shadow-md hover:shadow-xl transition-shadow duration-300"
              >
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-4xl">
                      📦
                    </div>
                  )}
                </div>
                <div className="px-3 py-3">
                  <span className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-600 transition-colors line-clamp-2">
                    {category.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-zinc-900">Featured Products</h2>
          <Link href="/products?filter=featured" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            View all &rarr;
          </Link>
        </div>
        <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} />
      </section>
    </div>
  );
}
