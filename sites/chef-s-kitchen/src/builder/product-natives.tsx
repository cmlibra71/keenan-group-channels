"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// Sealed product-page leaves, per site.
//
// The wrapper is engine; WHICH parts of a product page a site keeps as coded
// components is not. Chefs Depot seals only the gallery — its buybox, actions
// row and tabs are exploded masters. Industry Kitchens seals the purchase panel
// and the tab strip too, because both carry real interactive state (variant
// selection, review submission) that has not been exploded yet.
//
// `data` is the route's own bag, opaque to the engine.
// ============================================================================

export interface ProductNativesArgs {
  payload: Record<string, unknown>;
  variantImageUrl: string | null;
  data: Record<string, unknown>;
}

import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { GstToggle } from "@/components/layout/GstToggle";

export function productNatives({ payload, variantImageUrl }: ProductNativesArgs): NativeComponents {
  const product = (payload.product ?? {}) as Record<string, unknown>;
  return {
    // The gallery keeps its real zoom/pan/thumbnail behaviour.
    "product-gallery": () => (
      <ProductImageGallery
        images={product.images as unknown as GalleryImage[]}
        productName={String(product.name ?? "")}
        variantImageUrl={variantImageUrl}
        videos={(product.videos ?? []) as never}
      />
    ),
    // Storewide ex/inc-GST switch, now that it has left the masthead. Sealed
    // because it writes the GST cookie and flips a site-wide React context —
    // behaviour a tree cannot carry. `variant="light"` is not optional: the
    // default masthead variant is white-on-green and would be invisible on the
    // price card's steel-50 background. No `hidden md:` gating anywhere — the
    // node sits in normal flow so phones get it too.
    "gst-toggle": () => <GstToggle variant="light" className="mt-3" />,
  };
}
