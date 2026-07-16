"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { TrustBar } from "@/components/home/TrustBar";
import { SeoFaq } from "@/components/home/SeoFaq";
import { MembershipValueStrip } from "@/components/home/MembershipValueStrip";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { BrandShowcase } from "@/components/home/BrandShowcase";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";
import {
  HomeHeroView,
  HeroSidePanel,
  ShopByCategoryView,
  FeaturedProductsView,
  type HomeHeroData,
  type CategoryTile,
} from "./home-natives";
import type { GridProduct } from "@/components/product/ProductGridClient";

// ============================================================================
// The homepage rendered from the 'home' node doc. All nine legacy sections are
// sealed natives the designer can arrange/remove; the route prefetches ONLY
// the data the authored tree uses (walkTree over componentKeys) and passes it
// here. Markup parity: natives reuse the exact section components/views the
// block homepage renders.
// ============================================================================

type Pricing = { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };

export interface HomeNativeData {
  hero: HomeHeroData | null;
  categories: CategoryTile[];
  shopByCategoryCopy: { eyebrow: string; heading: string };
  membershipStrip: { planPrice: number; billingInterval: string; benefits: string[] } | null;
  brands: unknown[];
  clearance: { products: GridProduct[]; pricing: Pricing; heading: string; eyebrow: string } | null;
  featured: {
    products: GridProduct[];
    pricing: Pricing;
    memberPricingAvailable: boolean;
    heading: string;
    eyebrow: string;
  } | null;
  seoFaq: { heading?: string; body?: string; faqs?: { q: string; a: string }[] } | null;
  drawSpotlight: { prize: unknown; draw: unknown } | null;
}

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
  const nativeComponents: NativeComponents = {
    // Granular hero side panel (the rich seed authors the copy panel itself).
    "hero-side-panel": () =>
      home.hero ? (
        <HeroSidePanel
          planBenefits={home.hero.planBenefits}
          featuredPrize={home.hero.featuredPrize}
          featuredDraw={home.hero.featuredDraw}
          productCount={home.hero.productCount}
          brandCount={home.hero.brandCount}
        />
      ) : null,
    "home-hero": () => (home.hero ? <HomeHeroView {...home.hero} /> : null),
    "trust-bar": () => <TrustBar />,
    "shop-by-category": () => (
      <ShopByCategoryView
        categories={home.categories}
        eyebrow={home.shopByCategoryCopy.eyebrow}
        heading={home.shopByCategoryCopy.heading}
      />
    ),
    "membership-value-strip": () =>
      home.membershipStrip ? (
        <MembershipValueStrip
          planPrice={home.membershipStrip.planPrice}
          billingInterval={home.membershipStrip.billingInterval}
          benefits={home.membershipStrip.benefits}
        />
      ) : null,
    "brand-showcase": () => <BrandShowcase brands={home.brands as never} />,
    "clearance-spotlight": () =>
      home.clearance ? (
        <ClearanceSpotlight
          products={home.clearance.products as never}
          pricing={home.clearance.pricing as never}
          heading={home.clearance.heading}
          eyebrow={home.clearance.eyebrow}
        />
      ) : null,
    "featured-products": () => (home.featured ? <FeaturedProductsView {...home.featured} /> : null),
    "seo-faq": () => (home.seoFaq ? <SeoFaq {...home.seoFaq} /> : null),
    "draw-spotlight": () =>
      home.drawSpotlight?.prize ? (
        <DrawSpotlight prize={home.drawSpotlight.prize as never} draw={home.drawSpotlight.draw as never} />
      ) : null,
  };
  return (
    <BuilderActionsProvider handlers={{}} navigate={(to) => router.push(to)}>
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
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
