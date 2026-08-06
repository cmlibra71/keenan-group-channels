"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";

// Industry Kitchens' sealed leaf for the brand template — same KEY as Chefs
// Depot's, its own grid component and its own look. Uses ProductGridClient
// rather than ProductGrid: natives render client-side, and ProductGrid is a
// server component (see the note in ProductGridClient.tsx).
//
// Markup copied line-for-line from the Products section of
// app/brands/[slug]/page.tsx, including the `mt-12` wrapper and the empty state
// — a native that stands in for a page section has to be pixel-identical to it
// or the parity harness fails the conversion.
export function brandNatives(args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
  brandSlug?: string;
  brandName?: string;
}): NativeComponents {
  const { products, pricing, memberPricingAvailable, brandSlug, brandName } = args;
  return {
    "brand-products": () =>
      products.length > 0 ? (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Products</h2>
          <ProductGridClient
            products={products as GridProduct[]}
            memberPricingAvailable={memberPricingAvailable}
            {...pricing}
            listId={`brand_${brandSlug ?? ""}`}
            listName={brandName ?? ""}
          />
        </div>
      ) : (
        <p className="text-zinc-500 text-center py-12">No products from this brand yet.</p>
      ),
  };
}
