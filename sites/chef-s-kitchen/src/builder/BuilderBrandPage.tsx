"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";
import { masterLeafNatives, selectItemHandler, useAddToCartHandler, useAddToQuoteHandler } from "./master-leaves";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";

// ============================================================================
// The brand page rendered from the 'brand' node template. The route owns the
// data (brand row, viewer-scoped + account-priced products, pricing ctx) and
// passes it here; the sealed "brand-products" native closes over it. Authored
// elements bind brand.* / total from the composed payload (SHARED composer —
// identical to the designer's sample).
// ============================================================================

export function BuilderBrandPage({
  tree,
  payload,
  products,
  pricing,
  memberPricingAvailable,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  /** composeBrandPagePayload output ({ context, brand, products, total }). */
  payload: object;
  /** Viewer-scoped, account-priced rows for the sealed grid. */
  products: GridProduct[];
  pricing: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  memberPricingAvailable: boolean;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
}) {
  const router = useRouter();
  const addToCart = useAddToCartHandler();
  const addToQuote = useAddToQuoteHandler();
  const { inclusive, pricesIncludeTax } = useGst();
  const livePayload = React.useMemo(
    () => overlayLiveGst(payload, inclusive, pricesIncludeTax),
    [payload, inclusive, pricesIncludeTax]
  );
  const nativeComponents: NativeComponents = {
    // Sealed leaves the product-card master places:
    ...masterLeafNatives(),
    "brand-products": () => (
      <div>
        <h2 className="text-lg font-semibold text-ink-900 mb-4">Products</h2>
        <ProductGridClient
          products={products}
          memberPricingAvailable={memberPricingAvailable}
          {...pricing}
          listId="brand_products"
          listName="Brand Products"
        />
      </div>
    ),
  };
  return (
    <BuilderActionsProvider
      handlers={{ selectItem: selectItemHandler("brand_products", "Brand Products"), addToCart, addToQuote }}
      navigate={(to) => router.push(to)}
    >
      <Ga4ViewItemList
        listId="brand_products"
        listName="Brand Products"
        items={products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      <BuilderTree
        tree={tree}
        payload={livePayload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={Image as unknown as React.ComponentType<Record<string, unknown>>}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
