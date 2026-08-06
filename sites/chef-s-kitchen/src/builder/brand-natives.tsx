"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";

// Chefs Depot's sealed leaf for the brand template. Lifted verbatim out of the
// wrapper when that became shared engine — behaviour unchanged.
export function brandNatives(args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
  /** Passed by the shared wrapper; this site does not use it. */
  brandSlug?: string;
  brandName?: string;
}): NativeComponents {
  const { products, pricing, memberPricingAvailable } = args;
  return {
    "brand-products": () => (
      <div>
        <h2 className="text-lg font-semibold text-ink-900 mb-4">Products</h2>
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
