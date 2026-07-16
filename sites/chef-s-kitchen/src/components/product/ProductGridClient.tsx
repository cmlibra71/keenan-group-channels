"use client";
import { ProductCard } from "./ProductCard";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

// The CLIENT half of ProductGrid: pure grid + cards + GA4 list event, taking
// rows that are ALREADY viewer-scoped and account-priced (the server pass in
// ProductGrid, or a route feeding a Site Builder native). Never call this with
// raw cache rows — visibility/pricing must be applied server-side first.

export interface GridProduct {
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

export function ProductGridClient({
  products,
  memberPricingAvailable,
  memberPriceMap,
  isMember,
  planPrice,
  eyebrow,
  clearance,
  narrow,
  listId,
  listName,
}: {
  products: GridProduct[];
  memberPricingAvailable?: boolean;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
  eyebrow?: string | null;
  clearance?: boolean;
  narrow?: boolean;
  listId?: string;
  listName?: string;
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
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      {products.map((product, index) => (
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
          listId={listId}
          listName={listName}
          listIndex={index}
        />
      ))}
    </div>
  );
}
