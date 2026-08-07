"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { WarrantyDirectory } from "@/components/product/WarrantyDirectory";
import { GstToggle } from "@/components/layout/GstToggle";

// ============================================================================
// Industry Kitchens' sealed product-page leaves.
//
// The wrapper is engine; WHICH parts of a product page a site keeps as coded
// components is not. Two are left, and both are the same KIND of thing Chefs
// Depot seals — a widget with behaviour or data of its own, never a layout:
//
//   product-gallery    — zoom, pan, thumbnail rail, video slides.
//   warranty-directory — the 100-brand claims table with its search box. The
//     dataset lives inside the component; a tree can lay out a list, it cannot
//     carry the list.
//
// Everything else on this page is now authored: the buybox (price, options,
// CTAs, bulk tiers) and, as of this change, the tab strip and its panels. The
// keys those used to occupy — product-overview, product-tabs — are gone from
// here ON PURPOSE: natives win over masters by key, so leaving either behind
// would silently un-explode the section the moment someone re-published it.
//
// `data` is the route's own bag; the shapes below mirror what the legacy page
// passes to each component.
// ============================================================================

export interface ProductNativesArgs {
  payload: Record<string, unknown>;
  variantImageUrl: string | null;
  data: Record<string, unknown>;
}

export function productNatives({ payload, variantImageUrl, data }: ProductNativesArgs): NativeComponents {
  const product = (payload.product ?? {}) as Record<string, unknown>;
  void data;

  return {
    "product-gallery": () => (
      <ProductImageGallery
        images={product.images as unknown as GalleryImage[]}
        productName={String(product.name ?? "")}
        variantImageUrl={variantImageUrl}
        videos={(product.videos ?? []) as never}
      />
    ),
    "warranty-directory": () => <WarrantyDirectory />,
    // Storewide ex/inc-GST switch, now that it has left the header. Sealed for
    // the same reason as the two above: it carries behaviour of its own (writes
    // the GST cookie, flips a site-wide React context). It sits in normal flow
    // with no `hidden md:` gating, so phones get it too.
    "gst-toggle": () => <GstToggle className="mt-3" />,
  };
}
