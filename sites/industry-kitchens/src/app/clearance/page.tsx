import { getProducts, getFeatureFlag } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";

export const metadata = {
  title: "Clearance",
  description: "Shop our clearance items at reduced prices.",
};

export default async function ClearancePage() {
  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts({ onSale: true, limit: 48 }),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">Clearance</h1>
        <p className="mt-2 text-zinc-500">
          {total} {total === 1 ? "item" : "items"} on sale
        </p>
      </div>

      {products.length > 0 ? (
        <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} />
      ) : (
        <p className="text-zinc-500 text-center py-12">No clearance items at the moment. Check back soon!</p>
      )}
    </div>
  );
}
