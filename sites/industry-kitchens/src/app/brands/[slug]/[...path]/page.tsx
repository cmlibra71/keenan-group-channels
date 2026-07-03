import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getCategoryBySlug, getProducts, getFeatureFlag } from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";

// Brand + category combo page: renders the brand's products filtered to a
// specific category. Mirrors the original Zoey URL pattern
// /brands/<brand>/<category-slug>. Uses the SAME PDP/category template
// pattern — no new design, just a new filter combination.
export default async function BrandCategoryPage({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path } = await params;

  // The original Zoey URLs vary in depth (e.g.
  // /brands/<brand>/<cat>, /brands/<brand>/<parent>/<cat>). Use the deepest
  // segment as the category slug. The Zoey suffix (e.g. `combi-ovens-4`) is
  // stripped before lookup.
  const last = path[path.length - 1] ?? "";
  const cleanCatSlug = last.replace(/-\d+$/, "");

  const [brand, category, memberPricingEnabled] = await Promise.all([
    getBrandBySlug(slug),
    getCategoryBySlug(cleanCatSlug),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  if (!brand) notFound();

  // If we can't resolve the category, fall back to brand-only products. This
  // gives the URL a sensible landing instead of 404.
  const filter: { brandId: number; categoryId?: number; limit: number } = {
    brandId: brand.id as number,
    limit: 48,
  };
  if (category) filter.categoryId = category.id;

  const { products, total } = await getProducts(filter);

  const heading = category
    ? `${brand.name as string} — ${category.name as string}`
    : (brand.name as string);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/brands" className="hover:text-zinc-600">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/brands/${slug}`} className="hover:text-zinc-600">
          {brand.name as string}
        </Link>
        {category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-zinc-700">{category.name as string}</span>
          </>
        )}
      </nav>

      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-zinc-50 rounded-2xl overflow-hidden">
        {(brand.image_url as string | null) && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 relative min-h-[200px]">
            <Image
              src={brand.image_url as string}
              alt={brand.name as string}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-6"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${brand.image_url ? "" : "pl-8"}`}>
          <h1 className="text-3xl font-bold text-zinc-900">{heading}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {products.length > 0 ? (
        <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={await getListingMemberPrices(products)} listId={`brand_${brand.slug ?? brand.id}`} listName={String(brand.name ?? "")} />
      ) : (
        <p className="text-zinc-500 text-center py-12">
          {category
            ? `No ${brand.name as string} products in ${category.name as string}.`
            : `No products from ${brand.name as string} yet.`}
        </p>
      )}
    </div>
  );
}
