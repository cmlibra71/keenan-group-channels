"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";
import {
  enquireHandler,
  masterLeafNatives,
  selectItemHandler,
  useAddToCartHandler,
  useAddToQuoteHandler,
} from "./master-leaves";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useFormHandlers } from "./use-form-handlers";
import { brandNatives } from "./brand-natives";

/**
 * What the engine itself needs from a brand product — only enough to emit the
 * GA4 view_item_list payload. Each site's grid takes its own richer type; this
 * stays structural so the shared wrapper never imports a site component.
 */
export interface BrandGridProduct {
  id: number | string;
  sku?: string | null;
  name: string;
  brandName?: string | null;
  price: string;
  salePrice?: string | null;
}

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
  products: BrandGridProduct[];
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
  // masterLeafNatives is engine — every dependency it has exists on both
  // sites. Only the products grid is site-specific, so only that is delegated:
  // shared keys, each site's own look.
  const brandIdentity = (() => {
    const b = (payload as { brand?: Record<string, unknown> }).brand ?? {};
    return { slug: String(b.slug ?? b.id ?? ""), name: String(b.name ?? "") };
  })();

  const nativeComponents: NativeComponents = {
    ...masterLeafNatives(),
    // Brand identity comes from the composed payload so the site's grid can
    // emit the same GA4 list id/name the legacy page does.
    ...brandNatives({
      products,
      pricing,
      memberPricingAvailable,
      brandSlug: brandIdentity.slug,
      brandName: brandIdentity.name,
    }),
  };
  const formHandlers = useFormHandlers();
  const brandHandlers = React.useMemo(
    () => ({
      ...formHandlers,
      selectItem: selectItemHandler("brand_products", "Brand Products"),
      addToCart,
      addToQuote,
      enquire: enquireHandler(router),
    }),
    [formHandlers, addToCart, addToQuote, router]
  );
  return (
    <BuilderActionsProvider
      handlers={brandHandlers}
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
