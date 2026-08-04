"use client";

import { ProductCard } from "./ProductCard";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

// ============================================================================
// The client half of ProductGrid, for Site Builder trees.
//
// ProductGrid is a server component: it runs applyCatalogScope +
// applyAccountPrices before rendering. A builder native cannot use it — natives
// render inside a "use client" tree, and pulling ProductGrid in drags
// next/headers into the client bundle (which is exactly how the first attempt
// at IK's brand tree failed to build).
//
// The scope/price pass is not lost, it moves UP: renderBrandNodeBranch applies
// both to the rows before they reach the tree, so what arrives here is already
// scoped and account-priced. This file is therefore presentation only, and must
// stay that way — no server import may ever enter it.
//
// Mirrors Chefs Depot's ProductGridClient in role, not in look: the card and
// the grid classes are Industry Kitchens' own.
// ============================================================================

export interface GridProduct {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

export function ProductGridClient({
  products,
  memberPricingAvailable,
  memberPriceMap,
  listId,
  listName,
}: {
  products: GridProduct[];
  memberPricingAvailable?: boolean;
  memberPriceMap?: Record<number, number>;
  listId?: string;
  listName?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: String(p.id),
          item_name: p.name,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          productId={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          memberPricingAvailable={memberPricingAvailable}
          memberPrice={memberPriceMap?.[product.id] ?? null}
          listId={listId}
          listName={listName}
          listIndex={index}
        />
      ))}
    </div>
  );
}
