"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { homeSectionNatives, type HomeNativeData } from "./home-natives";
import {
  enquireHandler,
  masterLeafNatives,
  selectItemHandler,
  selectPromotionHandler,
  useAddToCartHandler,
  useAddToQuoteHandler,
  viewItemListHandler,
  viewPromotionHandler,
} from "./master-leaves";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useFormHandlers } from "./use-form-handlers";

// ============================================================================
// The homepage rendered from the 'home' node doc — ENGINE.
//
// The legacy sections are sealed natives the designer can arrange or remove;
// the route prefetches ONLY the data the authored tree uses (walkTree over
// componentKeys) and passes it here.
//
// This file is identical on every site. It used to import Chefs Depot's
// TrustBar / SeoFaq / BrandShowcase / ClearanceSpotlight directly, which is
// what made it unportable — those now come from ./home-natives under shared
// KEYS, together with the site's own HomeNativeData shape. That is the seam;
// see docs/architecture/seam-audit.md.
// ============================================================================

// Re-exported so the site's home-data module keeps importing the type from
// here, as it did before the split.
export type { HomeNativeData };

export function BuilderHomePage({
  tree,
  payload,
  home,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  /** composeHomePagePayload output (bindables). */
  payload: object;
  /** Prefetched section data for the sealed natives. */
  home: HomeNativeData;
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
  const formHandlers = useFormHandlers();
  // Memoized: a fresh object literal each render defeats the actions
  // provider's useMemo and re-creates every handler on every paint.
  const homeHandlers = React.useMemo(
    () => ({
      ...formHandlers,
      selectItem: selectItemHandler(),
      addToCart,
      addToQuote,
      enquire: enquireHandler(router),
      viewPromotion: viewPromotionHandler(),
      viewItemList: viewItemListHandler(),
      selectPromotion: selectPromotionHandler(),
    }),
    [formHandlers, addToCart, addToQuote, router]
  );
  const nativeComponents: NativeComponents = {
    // Sealed leaves the card/panel masters place (CTAs + the count-up stats
    // banner; price-block is a component master reading context.gst):
    ...masterLeafNatives(),
    // The site's own homepage sections.
    ...homeSectionNatives(home),
  };
  return (
    <BuilderActionsProvider
      handlers={homeHandlers}
      navigate={(to) => router.push(to)}
    >
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
