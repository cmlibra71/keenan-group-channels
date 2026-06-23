import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // getBrandBySlug → getBySlug runs transformRow, so the row is snake_case at runtime
  // (image_url). Type it so the loose Record<string,unknown> doesn't surface as `unknown`.
  const brand = (await getBrandBySlug(slug)) as
    | { id: number; name: string; slug: string; image_url: string | null }
    | null;

  if (!brand) {
    notFound();
  }

  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts({ brandId: brand.id as number, limit: 48 }),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-steel-400 mb-6">
        <Link href="/brands" className="hover:text-steel-500">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink-700">{brand.name as string}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-steel-50 rounded-2xl overflow-hidden">
        {brand.image_url && (
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
          <h1 className="page-title">{brand.name as string}</h1>
          <p className="mt-3 text-sm text-steel-500">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {/* Products */}
      {products.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-ink-900 mb-4">Products</h2>
          <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} {...(await getListingPricing(products))} />
        </div>
      ) : (
        <p className="text-steel-500 text-center py-12">No products from this brand yet.</p>
      )}
    </div>
  );
}
