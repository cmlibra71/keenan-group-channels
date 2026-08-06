"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";

// ============================================================================
// Industry Kitchens' sealed product-page leaves.
//
// The wrapper is engine; WHICH parts of a product page a site keeps as coded
// components is not. Chefs Depot seals only the gallery — its buybox, actions
// row and tabs are exploded masters. IK seals two more, and deliberately:
//
//   product-overview — the whole gallery + details + purchase column. It owns
//     variant selection, option validation and the member-price display, all of
//     it live React state. Exploding it is a separate job with its own parity
//     gate; sealing it first is what makes the surrounding page editable TODAY
//     without risking the thing that actually takes the money.
//
//   product-tabs — description / reviews / warranty / downloads / lease, with
//     a review form that posts. Same reasoning.
//
// Both stay pixel-identical because they ARE the live components.
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
  const d = data as {
    purchaseProduct?: unknown;
    memberPrice?: number | null;
    memberPriceMap?: Record<number, number>;
    isMember?: boolean;
    membershipTeaser?: { fromPrice: string | null } | null;
    reviews?: unknown[];
    attachments?: unknown[];
    description?: string | null;
    warranty?: string | null;
    customFields?: Record<string, unknown> | null;
    productId?: number;
  };

  return {
    "product-gallery": () => (
      <ProductImageGallery
        images={product.images as unknown as GalleryImage[]}
        productName={String(product.name ?? "")}
        variantImageUrl={variantImageUrl}
        videos={(product.videos ?? []) as never}
      />
    ),
    "product-overview": () =>
      d.purchaseProduct ? (
        <ProductPageClient
          product={d.purchaseProduct as never}
          memberPrice={d.memberPrice ?? null}
          memberPriceMap={d.memberPriceMap ?? {}}
          isMember={d.isMember ?? false}
          membershipTeaser={d.membershipTeaser ?? null}
        />
      ) : null,
    "product-tabs": () => (
      <ProductTabs
        description={d.description ?? null}
        warranty={d.warranty ?? null}
        customFields={d.customFields ?? null}
        reviews={(d.reviews ?? []) as never}
        attachments={(d.attachments ?? []) as never}
        productId={Number(d.productId ?? 0)}
      />
    ),
  };
}
