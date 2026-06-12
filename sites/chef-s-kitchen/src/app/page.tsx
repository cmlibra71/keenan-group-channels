import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import { getProducts, getSiteConfig, getMegaMenu, getTopCategories, getFeatureFlag, getSubscriptionPlans, getUpcomingDraws, getBrandsForChannel, prizeService, productChannelAssignmentService, CHANNEL_ID } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { TrustBar } from "@/components/home/TrustBar";
import { MembershipValueStrip } from "@/components/home/MembershipValueStrip";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { StatsBanner } from "@/components/home/StatsBanner";
import { BrandShowcase } from "@/components/home/BrandShowcase";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, { products: clearanceProducts }, topCategories, megaMenu, allBrands, memberPricingEnabled, subscriptionsEnabled, drawsEnabled, productCount, brandCount] = await Promise.all([
    getSiteConfig(),
    getProducts({ limit: 8, featured: true }),
    getProducts({ limit: 9, onSale: true }),
    getTopCategories(),
    getMegaMenu(),
    getBrandsForChannel(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
    productChannelAssignmentService.countForChannel(CHANNEL_ID),
    productChannelAssignmentService.countBrandsForChannel(CHANNEL_ID),
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
    <div>
      {/* ═══ Hero — glassmorphism over kitchen photo (design system) ═══ */}
      {subscriptionsEnabled && plan ? (
        <section className="relative flex min-h-[520px] items-center overflow-hidden">
          {/* Photo + design-system dark overlay */}
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(20,22,20,.78)_0%,rgba(28,30,28,.5)_50%,rgba(20,22,20,.62)_100%)]" />

          <div className="relative z-10 container-page w-full py-10">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              {/* Lead card — frosted glass */}
              <div className="glass self-center p-8 text-white lg:p-10">
                <p className="mb-[18px] text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/85">
                  Members-Only Supply Partner
                </p>
                <h1 className="hero-title text-white">
                  Professional Culinary Supplies at Prices{" "}
                  <em className="not-italic text-member-bright">Reserved for the Trade</em>
                </h1>
                <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
                  From ${planPrice!.toFixed(2)}/{plan.billingInterval} — access wholesale pricing
                  and priority fulfilment across our full commercial range.
                </p>
                <div className="mt-[26px] flex flex-wrap gap-3">
                  <Link href="/membership" className="btn-primary">
                    Join &amp; Save
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/search" className="btn-glass">
                    Browse Equipment &amp; Supplies
                  </Link>
                </div>
              </div>

              {/* Right column — Member Benefits (or prize) + gold stat card */}
              <div className="flex flex-col gap-[18px] self-center">
                {featuredPrize ? (
                  <Link
                    href="/membership#draws"
                    className="group ml-auto block w-full max-w-[430px] rounded-panel border border-white/[0.14] bg-[rgba(20,16,18,.46)] p-7 text-white backdrop-blur-[14px] transition-colors hover:border-member/40"
                  >
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-member">
                      Members-Only Draw
                    </p>
                    <div className="flex items-start gap-5">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card border border-white/5 bg-ink-800">
                        {featuredPrize.imageUrl ? (
                          <Image
                            src={featuredPrize.imageUrl}
                            alt={featuredPrize.name}
                            fill
                            sizes="96px"
                            className="object-contain transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Crown className="h-8 w-8 text-member/30" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold leading-snug text-white">{featuredPrize.name}</h3>
                        {featuredPrize.value && parseFloat(featuredPrize.value) > 0 && (
                          <p className="mt-2 text-2xl font-bold text-member-bright">
                            ${parseFloat(featuredPrize.value).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                        {featuredDraw?.scheduledAt && (
                          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-member/30 bg-member/15 px-3 py-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-member" />
                            <span className="text-xs font-semibold tracking-wide text-member-bright">
                              Next Draw: {new Date(featuredDraw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="ml-auto w-full max-w-[430px] rounded-panel border border-white/[0.14] bg-[rgba(20,16,18,.46)] px-7 py-[26px] text-white backdrop-blur-[14px]">
                    <Crown className="mb-2 h-[22px] w-[22px] text-member" />
                    <h3 className="heading-serif mb-3.5 text-[21px] text-white">Member Benefits</h3>
                    <ul>
                      {planBenefits.slice(0, 4).map((b, i) => (
                        <li key={i} className="flex items-center gap-[11px] py-2 text-[13.5px] text-white/90">
                          <span className={`h-0.5 w-4 shrink-0 ${i === 1 ? "bg-accent-bright" : "bg-member"}`} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <StatsBanner productCount={productCount} brandCount={brandCount} />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative flex min-h-[460px] items-center overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(20,22,20,.78)_0%,rgba(28,30,28,.5)_50%,rgba(20,22,20,.62)_100%)]" />

          <div className="relative z-10 container-page w-full py-10">
            <div className="glass max-w-2xl p-8 text-white lg:p-10">
              <p className="mb-[18px] text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/85">
                Commercial Kitchen Equipment
              </p>
              <h1 className="hero-title text-white">
                Welcome to {channel?.name || "our store"}
              </h1>
              <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
                Discover our curated range of professional-grade kitchen equipment.
              </p>
              <Link href="/products" className="btn-primary mt-[26px]">
                Browse Equipment
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Trust bar (design system) ═══ */}
      <TrustBar />


      {/* ═══ Shop by category — design catcards ═══ */}
      {topCategories.length > 0 && (
        <section className="container-page section-padding">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-3">Departments</p>
              <h2 className="section-title">Shop by Category</h2>
            </div>
            <Link href="/categories" className="hidden items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover sm:inline-flex">
              View All
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {topCategories.slice(0, 8).map((category: { id: number; name: string; slug: string; imageUrl?: string | null }) => {
              const childCount = megaMenu.departments.find((d) => d.id === category.id)?.children.length ?? 0;
              return (
                <Link
                  key={category.id}
                  href={`/categories/${category.slug}`}
                  className="group overflow-hidden rounded-card border border-border bg-white transition-all duration-200 hover:-translate-y-[3px] hover:border-brand-light hover:shadow-hover"
                >
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-brand-tint to-steel-200">
                    {category.imageUrl && (
                      <Image
                        src={category.imageUrl}
                        alt={category.name}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-[15px]">
                    <div>
                      <b className="block text-[15px] font-bold text-text-primary">{category.name}</b>
                      {childCount > 0 && (
                        <span className="text-[11.5px] text-steel-500">
                          {childCount} categor{childCount === 1 ? "y" : "ies"}
                        </span>
                      )}
                    </div>
                    <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-brand-tint text-brand-deep transition-colors duration-200 group-hover:bg-accent group-hover:text-white">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ Membership value strip (design system) ═══ */}
      {subscriptionsEnabled && plan && (
        <MembershipValueStrip
          planPrice={planPrice!}
          billingInterval={plan.billingInterval}
          benefits={planBenefits}
        />
      )}

      {/* ═══ Brand Showcase ═══ */}
      <BrandShowcase brands={featuredBrands} />

      {/* ═══ Last Units scroll row ═══ */}
      <ClearanceSpotlight
        products={clearanceProducts}
        heading="Last Units"
        eyebrow="While Stocks Last"
        pricing={await getListingPricing(clearanceProducts)}
      />

      {/* ═══ Featured Products ═══ */}
      <section className="container-page section-padding">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="eyebrow mb-3">Curated Selection</p>
            <h2 className="section-title">Featured Equipment</h2>
          </div>
          <Link href="/products?filter=featured" className="hidden sm:inline-flex items-center gap-1.5 nav-link">
            View All
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} {...(await getListingPricing(featuredProducts))} />
      </section>

      {/* ═══ Draw Spotlight ═══ */}
      {drawsEnabled && featuredPrize && (
        <DrawSpotlight prize={featuredPrize} draw={featuredDraw} />
      )}
    </div>
  );
}
