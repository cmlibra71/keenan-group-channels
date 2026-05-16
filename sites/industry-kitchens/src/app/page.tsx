import Link from "next/link";
import {
  getProducts,
  getSiteConfig,
  getFeatureFlag,
  getSubscriptionPlans,
  getUpcomingDraws,
  getBrandsForChannel,
  getHomepageCopy,
  getValueBarItems,
  getHomepageSpotlights,
  getHomepageCategoryTiles,
  getBannerBlocks,
  getWhyShop,
  getCustomerLogos,
  getKnowledgeHubLinks,
  getSpecialistCta,
  prizeService,
  CHANNEL_ID,
} from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { MembershipCTA } from "@/components/home/MembershipCTA";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { BrandShowcase } from "@/components/home/BrandShowcase";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";
import { HomepageSpotlight } from "@/components/home/HomepageSpotlight";
import { CategoryTileGrid } from "@/components/home/CategoryTileGrid";
import { BannerBlock } from "@/components/home/BannerBlock";
import { WhyShop } from "@/components/home/WhyShop";
import { CustomerLogos } from "@/components/home/CustomerLogos";
import { KnowledgeHub } from "@/components/home/KnowledgeHub";
import { SpecialistCta } from "@/components/home/SpecialistCta";

export default async function HomePage() {
  const [
    ,
    { products: featuredProducts },
    { products: clearanceProducts },
    categoryTiles,
    allBrands,
    memberPricingEnabled,
    subscriptionsEnabled,
    drawsEnabled,
    copy,
    valueBarItems,
    spotlights,
    banners,
    whyShop,
    customerLogos,
    knowledgeHub,
    specialistCta,
  ] = await Promise.all([
    getSiteConfig(),
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onSale: true, limit: 9 }),
    getHomepageCategoryTiles(),
    getBrandsForChannel(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
    getHomepageCopy(),
    getValueBarItems(),
    getHomepageSpotlights(),
    getBannerBlocks(),
    getWhyShop(),
    getCustomerLogos(),
    getKnowledgeHubLinks(),
    getSpecialistCta(),
  ]);

  // Prioritize brands with logos — otherwise they render as text which looks inconsistent
  const featuredBrands = [
    ...allBrands.filter((b: { image_url?: string | null }) => b.image_url),
    ...allBrands.filter((b: { image_url?: string | null }) => !b.image_url),
  ].slice(0, 9);

  // Fetch membership data if enabled
  let plan: { price: string; billingInterval: string; slug: string; benefits: unknown } | null = null;
  let featuredPrize: { id: number; name: string; imageUrl: string | null; value: string | null } | null = null;
  let featuredDraw: { id: number; name: string; scheduledAt: string | Date | null } | null = null;

  if (subscriptionsEnabled) {
    const [plans, upcomingDraws, activePrizes] = await Promise.all([
      getSubscriptionPlans(),
      drawsEnabled ? getUpcomingDraws() : Promise.resolve([]),
      drawsEnabled ? prizeService.listActiveForChannel(CHANNEL_ID) : Promise.resolve([]),
    ]);
    plan = plans[0] ?? null;
    featuredDraw = upcomingDraws[0] ?? null;

    if (activePrizes.length > 0) {
      featuredPrize = activePrizes.reduce((best, p) => {
        const val = p.value ? parseFloat(p.value) : 0;
        const bestVal = best.value ? parseFloat(best.value) : 0;
        return val > bestVal ? p : best;
      });
    }
  }

  const planPrice = plan ? parseFloat(plan.price) : null;
  const planBenefits = plan
    ? ((plan.benefits as string[]) || []).filter(
        (b) => drawsEnabled || !/draw|raffle|prize/i.test(b)
      )
    : [];

  return (
    <div className="bg-white">
      {/* Category tile grid — the homepage lead, matching industrykitchens.com.au */}
      <CategoryTileGrid tiles={categoryTiles} heading={copy.categories_heading} />

      {/* Value Bar (4-icon trust row) */}
      {valueBarItems.length > 0 && <ValueBar items={valueBarItems} />}

      {/* Homepage banners (e.g. Custom Stainless Steel / Low Velocity Canopy) */}
      {banners.map((b, i) => (
        <BannerBlock key={`banner-${i}`} {...b} flip={i % 2 === 1} />
      ))}

      {/* Curated homepage spotlights (e.g. Speed Ovens carousel) */}
      {spotlights.map((s) => (
        <HomepageSpotlight
          key={s.id}
          heading={s.heading}
          ctaHref={s.cta_href}
          products={s.products}
          memberPricingAvailable={memberPricingEnabled}
        />
      ))}

      {/* Brand Showcase */}
      <BrandShowcase brands={featuredBrands} heading={copy.brands_heading} eyebrow={copy.brands_eyebrow} />

      {/* Clearance Spotlight */}
      <ClearanceSpotlight products={clearanceProducts} heading={copy.clearance_heading} eyebrow={copy.clearance_eyebrow} />

      {/* Membership CTA Banner */}
      {subscriptionsEnabled && plan && (
        <MembershipCTA
          planPrice={planPrice!}
          billingInterval={plan.billingInterval}
          benefits={planBenefits}
        />
      )}

      {/* Featured Products */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-zinc-900">{copy.featured_heading ?? "Featured Products"}</h2>
          <Link href="/products?filter=featured" className="text-sm font-medium text-zinc-600 hover:text-[#D94B2B]">
            View all &rarr;
          </Link>
        </div>
        <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} />
      </section>

      {/* Draw Spotlight */}
      {drawsEnabled && featuredPrize && (
        <DrawSpotlight prize={featuredPrize} draw={featuredDraw} />
      )}

      {/* Why Shop */}
      <WhyShop heading={whyShop.heading} items={whyShop.items} />

      {/* Customer logos (Who We Supply) */}
      <CustomerLogos heading={customerLogos.heading} logos={customerLogos.logos} />

      {/* Knowledge Hub */}
      <KnowledgeHub heading={knowledgeHub.heading} links={knowledgeHub.links} />

      {/* Talk to a Specialist */}
      <SpecialistCta {...specialistCta} />
    </div>
  );
}
