"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductGrid } from "@/components/product/ProductGrid";

// Industry Kitchens' sealed leaf for the brand template — same KEY as Chefs
// Depot's, its own grid component and its own look.
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
        <ProductGrid
          products={products as never}
          memberPricingAvailable={memberPricingAvailable}
          {...pricing}
        />
      </div>
    ),
  };
}
