import {
  getProducts,
  getSiteConfig,
  getMegaMenu,
  getTopCategories,
  getFeatureFlag,
  getBrandsForChannel,
  getJsonSetting,
  productChannelAssignmentService,
  CHANNEL_ID,
} from "@/lib/store";
import { getListingPricing, applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { getMembershipContext, copy } from "@/blocks/home-blocks";
import type { HomeNativeData } from "./BuilderHomePage";
import type { GridProduct } from "@/components/product/ProductGridClient";
import type { HomeSectionsInput } from "@keenan/services/builder";

// ============================================================================
// SERVER data assembly for the node homepage. Fetches ONLY the sections the
// authored tree actually uses (`keys` = componentKeys found by walkTree) —
// mirrors the exact queries the legacy home blocks run, so the natives render
// identical data. Also returns the composer-ready `sections` for bindables.
// ============================================================================

export async function loadHomeNativeData(
  keys: Set<string>
): Promise<{ home: HomeNativeData; sections: HomeSectionsInput }> {
  const needHero = keys.has("home-hero") || keys.has("hero-side-panel");
  const needCats = keys.has("shop-by-category");
  const needStrip = keys.has("membership-value-strip");
  const needBrands = keys.has("brand-showcase");
  const needClearance = keys.has("clearance-spotlight");
  const needFeatured = keys.has("featured-products");
  const needFaq = keys.has("seo-faq");
  const needDraw = keys.has("draw-spotlight");
  const needMembership = needHero || needStrip || needDraw;

  const [membership, siteConfig, counts, topCategories, megaMenu, brands, clearanceRes, featuredRes, memberPricingEnabled, seoFaq] =
    await Promise.all([
      needMembership ? getMembershipContext() : null,
      needHero ? getSiteConfig() : null,
      needHero
        ? Promise.all([
            productChannelAssignmentService.countForChannel(CHANNEL_ID),
            productChannelAssignmentService.countBrandsForChannel(CHANNEL_ID),
          ])
        : null,
      needCats ? getTopCategories() : [],
      needCats ? getMegaMenu() : null,
      needBrands ? getBrandsForChannel() : [],
      needClearance ? getProducts({ limit: 9, onSale: true }) : null,
      needFeatured ? getProducts({ limit: 8, featured: true }) : null,
      needClearance || needFeatured ? getFeatureFlag("member_pricing_enabled") : false,
      needFaq
        ? getJsonSetting("homepage_seo", {} as { heading?: string; body?: string; faqs?: { q: string; a: string }[] })
        : null,
    ]);

  const scopePrice = async (rows: Record<string, unknown>[]) =>
    (await applyAccountPrices(await applyCatalogScope(rows as never))) as unknown as GridProduct[];

  const clearanceProducts = clearanceRes ? await scopePrice(clearanceRes.products as never) : [];
  const featuredProducts = featuredRes ? await scopePrice(featuredRes.products as never) : [];
  const [clearancePricing, featuredPricing] = await Promise.all([
    clearanceProducts.length ? getListingPricing(clearanceProducts as never) : null,
    featuredProducts.length ? getListingPricing(featuredProducts as never) : null,
  ]);

  const featuredBrands = needBrands
    ? [
        ...brands.filter((b: { image_url?: string | null }) => b.image_url),
        ...brands.filter((b: { image_url?: string | null }) => !b.image_url),
      ].slice(0, 9)
    : [];

  const p = (k: string, key: string) => copy(k, key, {});
  const heroMembership = !!(membership?.subscriptionsEnabled && membership.plan);
  const home: HomeNativeData = {
    hero: needHero
      ? {
          membership: heroMembership,
          eyebrow: p("home_hero", "eyebrow"),
          headline: heroMembership
            ? p("home_hero", "headline")
            : `Welcome to ${(siteConfig?.channel as { name?: string } | null)?.name || "our store"}`,
          headlineEmphasis: p("home_hero", "headline_emphasis"),
          subheadline: heroMembership
            ? p("home_hero", "subheadline").replace(
                "{price}",
                `$${membership!.planPrice!.toFixed(2)}/${membership!.plan!.billing_interval}`
              )
            : p("home_hero", "subheadline"),
          ctaText: p("home_hero", "cta_text"),
          ctaHref: p("home_hero", "cta_href"),
          cta2Text: p("home_hero", "cta2_text"),
          cta2Href: p("home_hero", "cta2_href"),
          planBenefits: membership?.planBenefits ?? [],
          featuredPrize: membership?.featuredPrize ?? null,
          featuredDraw: membership?.featuredDraw
            ? {
                scheduled_at: membership.featuredDraw.scheduled_at
                  ? new Date(membership.featuredDraw.scheduled_at).toISOString()
                  : null,
              }
            : null,
          productCount: counts?.[0] ?? 0,
          brandCount: counts?.[1] ?? 0,
        }
      : null,
    categories: needCats
      ? (topCategories as { id: number; name: string; slug: string; image_url?: string | null }[])
          .slice(0, 8)
          .map((c) => ({
            ...c,
            childCount: megaMenu?.departments.find((d: { id: number }) => d.id === c.id)?.children.length ?? 0,
          }))
      : [],
    shopByCategoryCopy: {
      eyebrow: p("shop_by_category", "eyebrow"),
      heading: p("shop_by_category", "heading"),
    },
    membershipStrip:
      needStrip && membership?.subscriptionsEnabled && membership.plan
        ? {
            planPrice: membership.planPrice!,
            billingInterval: membership.plan.billing_interval,
            benefits: membership.planBenefits,
          }
        : null,
    brands: featuredBrands,
    clearance: needClearance
      ? {
          products: clearanceProducts,
          pricing: (clearancePricing ?? {}) as NonNullable<HomeNativeData["clearance"]>["pricing"],
          heading: p("clearance_spotlight", "heading"),
          eyebrow: p("clearance_spotlight", "eyebrow"),
        }
      : null,
    featured: needFeatured
      ? {
          products: featuredProducts,
          pricing: (featuredPricing ?? {}) as NonNullable<HomeNativeData["featured"]>["pricing"],
          memberPricingAvailable: memberPricingEnabled,
          heading: p("featured_products", "heading"),
          eyebrow: p("featured_products", "eyebrow"),
        }
      : null,
    seoFaq: needFaq ? (seoFaq as HomeNativeData["seoFaq"]) : null,
    drawSpotlight:
      needDraw && membership?.drawsEnabled && membership.featuredPrize
        ? { prize: membership.featuredPrize, draw: membership.featuredDraw }
        : null,
  };

  // Merged member-price map for the composer's card enrichment (ids unique
  // across rails, so one map serves both).
  const mergedPricing = {
    memberPriceMap: {
      ...((clearancePricing as { memberPriceMap?: Record<number, number> } | null)?.memberPriceMap ?? {}),
      ...((featuredPricing as { memberPriceMap?: Record<number, number> } | null)?.memberPriceMap ?? {}),
    },
  };
  const tilesWithCounts = needCats
    ? (topCategories as Record<string, unknown>[]).map((c) => ({
        ...c,
        childCount:
          megaMenu?.departments.find((d: { id: number }) => d.id === (c as { id: number }).id)?.children.length ?? 0,
      }))
    : [];
  const sections: HomeSectionsInput = {
    hero: home.hero
      ? {
          eyebrow: home.hero.eyebrow,
          headline: home.hero.headline,
          headline_emphasis: home.hero.headlineEmphasis,
          subheadline: home.hero.subheadline,
          cta_text: home.hero.ctaText,
          cta_href: home.hero.ctaHref,
          cta2_text: home.hero.cta2Text,
          cta2_href: home.hero.cta2Href,
        }
      : null,
    pricing: mergedPricing,
    topCategories: tilesWithCounts as Record<string, unknown>[],
    brands: featuredBrands as Record<string, unknown>[],
    featured: featuredProducts as unknown as Record<string, unknown>[],
    clearance: clearanceProducts as unknown as Record<string, unknown>[],
    membership: membership?.plan ? ({ ...membership.plan, planPrice: membership.planPrice } as Record<string, unknown>) : null,
    faq: (seoFaq as { faqs?: Record<string, unknown>[] } | null)?.faqs ?? null,
  };

  return { home, sections };
}
