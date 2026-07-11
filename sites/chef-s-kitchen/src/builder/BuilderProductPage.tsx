"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { NodeTree, ProductPagePayload } from "@keenan/services/builder";
import {
  ProductPurchaseProvider,
  useProductPurchase,
  useProductPageScope,
  useProductPageHandlers,
  enrichProductPayload,
  type PurchaseProduct,
} from "@keenan/services/product-page";
import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { useGst } from "@/lib/gst";
import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { BackButton } from "@/components/ui/BackButton";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { BuilderTree, type NativeComponents } from "@keenan/services/builder-react";
import { BuilderActionsProvider } from "@keenan/services/builder-react";

// ============================================================================
// The product page rendered from a node tree. Thin wrapper over the SHARED
// presentation layer (@keenan/services/product-page) so the storefront and the
// portal editor render identically. This file only supplies the storefront's
// framework-specific bits: the real server actions, the native gallery/back
// components, Next <Link>/<Image>, and sanitizeHtml.
// ============================================================================

function ActionsBridge({
  productId,
  tree,
  payload,
  namedStyles,
  jsFunctions,
  callResults,
  components,
}: {
  productId: number;
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
}) {
  const purchase = useProductPurchase();
  const router = useRouter();
  const { inclusive, pricesIncludeTax } = useGst();
  const handlers = useProductPageHandlers({ productId, addToCart, addToQuote });
  const scope = useProductPageScope(payload, { inclusive, pricesIncludeTax });

  // Coded (non-exploded) components slotted in by key — the gallery keeps its
  // real zoom/pan/thumbnail behaviour. Variant images that are relative Zoey
  // media paths would 403 the S3-only proxy → fall back to product images.
  const variantImg =
    purchase.variantImageUrl && /^https?:\/\//i.test(purchase.variantImageUrl)
      ? purchase.variantImageUrl
      : null;
  const nativeComponents: NativeComponents = {
    "product-gallery": () => (
      <ProductImageGallery
        images={payload.product.images as unknown as GalleryImage[]}
        productName={payload.product.name}
        variantImageUrl={variantImg}
      />
    ),
    "back-to-products": () => (
      <BackButton fallbackHref="/products" fallbackLabel="Back to Products" className="mb-6" />
    ),
  };

  return (
    <BuilderActionsProvider handlers={handlers} navigate={(to) => router.push(to)}>
      <BuilderTree
        tree={tree}
        payload={payload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={Image as unknown as React.ComponentType<Record<string, unknown>>}
        scope={scope}
      />
    </BuilderActionsProvider>
  );
}

export function BuilderProductPage({
  tree,
  payload,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
}) {
  const product = payload.product as unknown as PurchaseProduct;
  const enriched = React.useMemo(() => enrichProductPayload(payload, { sanitizeHtml }), [payload]);
  return (
    <ProductPurchaseProvider
      product={product}
      memberPrice={payload.pricing.memberPrice}
      memberPriceMap={payload.pricing.memberPriceMap}
      isMember={payload.pricing.isMember}
      membershipTeaser={payload.pricing.membershipTeaser}
    >
      <ActionsBridge productId={payload.product.id} tree={tree} payload={enriched} namedStyles={namedStyles} components={components} jsFunctions={jsFunctions} callResults={callResults} />
    </ProductPurchaseProvider>
  );
}
