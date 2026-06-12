import { ProductCard } from "./ProductCard";

interface ProductWithImage {
  id: number;
  name: string;
  sku?: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  brandName?: string | null;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

/**
 * Design-system product grid: 4-up ≥1024 / 3-up 768 / 2-up mobile (3-up max
 * when `narrow` — beside the category filter rail).
 */
export function ProductGrid({
  products,
  memberPricingAvailable,
  memberPriceMap,
  isMember,
  planPrice,
  eyebrow,
  clearance,
  narrow,
}: {
  products: ProductWithImage[];
  memberPricingAvailable?: boolean;
  /** Member prices keyed by product id (computed for guests too — join funnel). */
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
  /** Category eyebrow shown on each card. */
  eyebrow?: string | null;
  clearance?: boolean;
  /** 3-up max — used beside the category filter rail. */
  narrow?: boolean;
}) {
  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-text-muted">No products found.</p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${
        narrow ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"
      }`}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          sku={product.sku}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          brandName={product.brandName}
          eyebrow={eyebrow}
          memberPrice={memberPricingAvailable ? memberPriceMap?.[product.id] ?? null : null}
          isMember={isMember}
          planPrice={planPrice}
          clearance={clearance}
          availability={product.availability}
          inventoryLevel={product.inventoryLevel}
          inventoryTracking={product.inventoryTracking}
        />
      ))}
    </div>
  );
}
