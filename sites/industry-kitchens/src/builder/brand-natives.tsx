"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";

// Industry Kitchens' sealed leaf for the brand template — same KEY as Chefs
// Depot's, its own grid component and its own look. Uses ProductGridClient
// rather than ProductGrid: natives render client-side, and ProductGrid is a
// server component (see the note in ProductGridClient.tsx).
export function brandNatives(args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
}): NativeComponents {
  const { products, pricing, memberPricingAvailable } = args;
  return {
    "brand-products": () => (
      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Products</h2>
        <ProductGridClient
          products={products as GridProduct[]}
          memberPricingAvailable={memberPricingAvailable}
          {...pricing}
          listId="brand_products"
          listName="Brand Products"
        />
      </div>
    ),
  };
}
