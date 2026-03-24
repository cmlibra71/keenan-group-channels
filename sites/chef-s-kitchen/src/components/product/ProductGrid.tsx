import { ProductCard } from "./ProductCard";

interface ProductWithImage {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

export function ProductGrid({ products, memberPricingAvailable }: { products: ProductWithImage[]; memberPricingAvailable?: boolean }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-light text-sm">No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          memberPricingAvailable={memberPricingAvailable}
        />
      ))}
    </div>
  );
}
