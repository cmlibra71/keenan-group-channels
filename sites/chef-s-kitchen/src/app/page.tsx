import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import { getProducts, getSiteConfig, getTopCategories, getFeatureFlag, getSubscriptionPlans, getUpcomingDraws, prizeService, productChannelAssignmentService, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { MembershipCTA } from "@/components/home/MembershipCTA";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { StatsBanner } from "@/components/home/StatsBanner";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, topCategories, memberPricingEnabled, subscriptionsEnabled, productCount, brandCount] = await Promise.all([
    getSiteConfig(),
    getProducts({ limit: 8, featured: true }),
    getTopCategories(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
    productChannelAssignmentService.countForChannel(CHANNEL_ID),
    productChannelAssignmentService.countBrandsForChannel(CHANNEL_ID),
  ]);

  // Fetch membership data if enabled
  let plan: { price: string; billingInterval: string; slug: string; benefits: unknown } | null = null;
  let featuredPrize: { id: number; name: string; imageUrl: string | null; value: string | null } | null = null;
  let featuredDraw: { id: number; name: string; scheduledAt: string | Date | null } | null = null;

  if (subscriptionsEnabled) {
    const [plans, upcomingDraws, activePrizes] = await Promise.all([
      getSubscriptionPlans(),
      getUpcomingDraws(),
      prizeService.listActiveForChannel(CHANNEL_ID),
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
  const planBenefits = plan ? ((plan.benefits as string[]) || []) : [];

  return (
    <div>
      {/* ═══ Hero ═══ */}
      {subscriptionsEnabled && plan ? (
        <section className="relative overflow-hidden">
          {/* Background image with darkening gradient behind left card */}
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-zinc-900/50 to-zinc-900/30" />

          <StatsBanner productCount={productCount} brandCount={brandCount} />

          <div className="relative z-10 container-page py-20 sm:py-28 lg:py-32">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Left — main card */}
              <div className="lg:col-span-7 backdrop-blur-xl bg-white/30 border border-white/25 rounded-[28px] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.15)]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-5">
                  Members-Only Supply Partner
                </p>
                <h1 className="hero-title text-white leading-[1.08]">
                  Professional Culinary Supplies{"\u00A0"}at Prices Reserved for the Trade
                </h1>
                <p className="mt-5 text-base text-white/80 max-w-lg leading-relaxed">
                  From ${planPrice!.toFixed(2)}/{plan.billingInterval} — access wholesale pricing,
                  priority fulfilment, and member-exclusive draws across our full commercial range.
                </p>
                <div className="mt-9 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/membership"
                    className="inline-flex items-center justify-center gap-2 bg-teal-700 text-white px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-teal-800 transition-colors shadow-sm"
                  >
                    Join & Save
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/search"
                    className="inline-flex items-center justify-center gap-2 border border-white/30 bg-white/10 text-white px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-white/20 hover:border-white/50 transition-colors"
                  >
                    Browse Equipment & Supplies
                  </Link>
                </div>
              </div>

              {/* Right — featured prize or benefits card */}
              <div className="lg:col-span-5">
                {featuredPrize ? (
                  <Link href="/membership#draws" className="block backdrop-blur-xl bg-zinc-900/30 border border-white/10 rounded-[24px] p-7 shadow-[0_8px_40px_rgba(0,0,0,0.25)] hover:border-amber-500/30 transition-colors group">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400 mb-4">
                      Members-Only Draw
                    </p>
                    <div className="flex items-start gap-5">
                      <div className="relative h-28 w-28 bg-zinc-800 rounded-[10px] overflow-hidden shrink-0 border border-white/5">
                        {featuredPrize.imageUrl ? (
                          <Image
                            src={featuredPrize.imageUrl}
                            alt={featuredPrize.name}
                            fill
                            sizes="112px"
                            className="object-contain group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Crown className="h-8 w-8 text-amber-400/30" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-lg leading-snug">{featuredPrize.name}</h3>
                        {featuredPrize.value && parseFloat(featuredPrize.value) > 0 && (
                          <p className="text-2xl font-bold text-amber-400 mt-2">
                            ${parseFloat(featuredPrize.value).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                        {featuredDraw?.scheduledAt && (
                          <p className="mt-3 inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 rounded-full px-3 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-xs text-amber-300 font-semibold tracking-wide">
                              Next Draw: {new Date(featuredDraw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="backdrop-blur-xl bg-zinc-900/30 border border-white/10 rounded-[24px] p-7 shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
                    <Crown className="h-6 w-6 text-amber-400 mb-4" />
                    <h3 className="heading-serif text-xl text-white mb-4">Member Benefits</h3>
                    <ul className="space-y-3">
                      {planBenefits.slice(0, 4).map((b, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-start gap-3 leading-relaxed">
                          <span className="h-px w-4 bg-teal-500/60 mt-2.5 shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-zinc-900/50 to-zinc-900/30" />

          <StatsBanner productCount={productCount} brandCount={brandCount} />

          <div className="relative z-10 container-page py-24 sm:py-32">
            <div className="backdrop-blur-xl bg-white/30 border border-white/25 rounded-[28px] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.15)] max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-5">
                Commercial Kitchen Equipment
              </p>
              <h1 className="hero-title text-white">
                Welcome to {channel?.name || "our store"}
              </h1>
              <p className="mt-5 text-base text-white/80 max-w-lg leading-relaxed">
                Discover our curated range of professional-grade kitchen equipment.
              </p>
              <Link
                href="/products"
                className="mt-9 inline-flex items-center justify-center gap-2 bg-teal-700 text-white px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-teal-800 transition-colors shadow-sm"
              >
                Browse Equipment
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Value Bar ═══ */}
      {subscriptionsEnabled && <ValueBar />}

      {/* ═══ Categories — editorial grid ═══ */}
      {topCategories.length > 0 && (
        <section className="container-page section-padding">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="eyebrow mb-3">Departments</p>
              <h2 className="section-title">Shop by Category</h2>
            </div>
            <Link href="/categories" className="hidden sm:inline-flex items-center gap-1.5 nav-link">
              View All
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative overflow-hidden bg-surface-secondary aspect-[4/3]"
              >
                <div className="absolute inset-0 overflow-hidden">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-stone to-stone-warm" />
                  )}
                  {/* Dark overlay for text legibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-dark/70 via-surface-dark/20 to-transparent" />
                </div>
                <div className="relative h-full flex flex-col justify-end p-5 sm:p-6">
                  <span className="heading-serif text-lg sm:text-xl text-white drop-shadow-sm">
                    {category.name}
                  </span>
                  <span className="heading-sans text-white/60 mt-1 group-hover:text-white/80 transition-colors duration-300">
                    Explore
                    <ChevronRight className="inline h-2.5 w-2.5 ml-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ Membership CTA ═══ */}
      {subscriptionsEnabled && plan && (
        <MembershipCTA
          planPrice={planPrice!}
          billingInterval={plan.billingInterval}
          benefits={planBenefits}
        />
      )}

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
        <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} />
      </section>

      {/* ═══ Draw Spotlight ═══ */}
      {subscriptionsEnabled && featuredPrize && (
        <DrawSpotlight prize={featuredPrize} draw={featuredDraw} />
      )}
    </div>
  );
}
