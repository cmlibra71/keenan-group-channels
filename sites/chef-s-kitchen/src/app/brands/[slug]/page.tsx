import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

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
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/brands" className="hover:text-zinc-600">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-zinc-700">{brand.name as string}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-zinc-50 rounded-2xl overflow-hidden">
        {brand.imageUrl && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 relative min-h-[200px]">
            <Image
              src={brand.imageUrl as string}
              alt={brand.name as string}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-6"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${brand.imageUrl ? "" : "pl-8"}`}>
          <h1 className="text-3xl font-bold text-zinc-900">{brand.name as string}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {/* Products */}
      {products.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Products</h2>
          <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} />
        </div>
      ) : (
        <p className="text-zinc-500 text-center py-12">No products from this brand yet.</p>
      )}
    </div>
  );
}
