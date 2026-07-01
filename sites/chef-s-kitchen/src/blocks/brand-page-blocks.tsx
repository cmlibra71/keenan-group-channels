import Image from "next/image";
import { ProductGrid } from "@/components/product/ProductGrid";
import type { getListingPricing } from "@/lib/member";

type ListingPricing = Awaited<ReturnType<typeof getListingPricing>>;

// Brand page decomposed into blocks. These render the current brand-page markup
// verbatim; the page provides the live brand/products context. Registered so the
// __brand__ template shows them as reorderable blocks in Pages & Content.

type BrandLike = { id: number; name: string; slug: string; image_url: string | null };

export function BrandHero({ brand, total }: { brand: BrandLike; total: number }) {
  return (
    <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-steel-50 rounded-2xl overflow-hidden">
      {brand.image_url && (
        <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 relative min-h-[200px]">
          <Image
            src={brand.image_url}
            alt={brand.name}
            fill
            sizes="(max-width: 1024px) 100vw, 40vw"
            className="object-contain p-6"
          />
        </div>
      )}
      <div className={`flex-1 py-8 pr-8 text-left ${brand.image_url ? "" : "pl-8"}`}>
        <h1 className="page-title">{brand.name}</h1>
        <p className="mt-3 text-sm text-steel-500">
          {total} {total === 1 ? "product" : "products"}
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BrandProducts({
  products,
  memberPricingAvailable,
  pricing,
}: {
  products: any[];
  memberPricingAvailable: boolean;
  pricing: ListingPricing;
}) {
  return products.length > 0 ? (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-4">Products</h2>
      <ProductGrid products={products} memberPricingAvailable={memberPricingAvailable} {...pricing} />
    </div>
  ) : (
    <p className="text-steel-500 text-center py-12">No products from this brand yet.</p>
  );
}

// The default block order for a brand page (used when the template has no blocks).
export const DEFAULT_BRAND_BLOCKS = [
  { block_type: "brand_hero" },
  { block_type: "brand_products" },
] as const;
