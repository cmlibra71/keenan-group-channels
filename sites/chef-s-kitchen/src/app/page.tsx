import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import { getProducts, getSiteConfig, getCategories, getFeatureFlag, getSubscriptionPlans, getUpcomingDraws, prizeService, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { MembershipCTA } from "@/components/home/MembershipCTA";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, allCategories, memberPricingEnabled, subscriptionsEnabled] = await Promise.all([
    getSiteConfig(),
    getProducts({ featured: true, limit: 8 }),
    getCategories(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
  ]);

  // Top-level categories only
  const topCategories = allCategories.filter((c) => c.depth === 0).slice(0, 6);

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
        <section className="relative bg-navy overflow-hidden grain">
          {/* Subtle diagonal accent */}
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-teal/5 to-transparent pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-28 lg:py-32">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              {/* Left — editorial type lockup */}
              <div className="lg:col-span-7">
                <p className="heading-sans text-teal tracking-widest mb-6">
                  Members-Only Supply Partner
                </p>
                <h1 className="heading-serif text-4xl sm:text-5xl lg:text-6xl text-white">
                  Professional Kitchen Equipment at Prices Reserved for the Trade
                </h1>
                <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed font-light">
                  From ${planPrice!.toFixed(2)}/{plan.billingInterval} — access wholesale pricing,
                  priority fulfilment, and member-exclusive draws across our full commercial range.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                  <Link
                    href="/membership"
                    className="inline-flex items-center justify-center gap-2.5 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
                  >
                    Become a Member
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/products"
                    className="inline-flex items-center justify-center gap-2.5 border border-slate-600 text-slate-300 px-7 py-3.5 font-medium text-sm tracking-wide hover:border-slate-400 hover:text-white transition-colors duration-300"
                  >
                    Browse Equipment
                  </Link>
                </div>
              </div>

              {/* Right — featured prize or benefits card */}
              <div className="lg:col-span-5">
                {featuredPrize ? (
                  <Link href="/membership#draws" className="block border border-slate-700/50 bg-navy-light/50 backdrop-blur-sm p-8 hover:border-teal/30 transition-all duration-500 group">
                    <p className="heading-sans text-teal tracking-widest mb-5">
                      Members-Only Draw
                    </p>
                    <div className="flex items-start gap-5">
                      <div className="relative h-28 w-28 bg-slate-800 overflow-hidden shrink-0">
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
                            <Crown className="h-8 w-8 text-teal/30" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-white text-lg leading-snug">{featuredPrize.name}</h3>
                        {featuredPrize.value && parseFloat(featuredPrize.value) > 0 && (
                          <p className="text-xl heading-serif text-teal-light mt-1">
                            ${parseFloat(featuredPrize.value).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                        {featuredDraw?.scheduledAt && (
                          <p className="text-xs text-slate-500 mt-2 tracking-wide">
                            Draw: {new Date(featuredDraw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="border border-slate-700/50 bg-navy-light/50 backdrop-blur-sm p-8">
                    <Crown className="h-6 w-6 text-teal mb-4" />
                    <h3 className="heading-serif text-xl text-white mb-4">Member Benefits</h3>
                    <ul className="space-y-3">
                      {planBenefits.slice(0, 4).map((b, i) => (
                        <li key={i} className="text-sm text-slate-400 flex items-start gap-3 leading-relaxed">
                          <span className="h-px w-4 bg-teal/60 mt-2.5 shrink-0" />
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
        <section className="relative bg-navy overflow-hidden grain">
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">
            <p className="heading-sans text-teal tracking-widest mb-6">
              Commercial Kitchen Equipment
            </p>
            <h1 className="heading-serif text-4xl sm:text-5xl lg:text-6xl text-white max-w-3xl">
              Welcome to {channel?.name || "our store"}
            </h1>
            <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed font-light">
              Discover our curated range of professional-grade kitchen equipment.
            </p>
            <Link
              href="/products"
              className="mt-10 inline-flex items-center gap-2.5 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
            >
              Browse Equipment
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {/* ═══ Value Bar ═══ */}
      {subscriptionsEnabled && <ValueBar />}

      {/* ═══ Categories — editorial grid ═══ */}
      {topCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="heading-sans text-teal tracking-widest mb-3">Departments</p>
              <h2 className="heading-serif text-3xl sm:text-4xl text-navy">Shop by Category</h2>
            </div>
            <Link href="/categories" className="hidden sm:inline-flex items-center gap-1.5 heading-sans text-ink-light hover:text-navy transition-colors duration-300">
              View All
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative overflow-hidden bg-stone-warm aspect-[4/3]"
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
                  <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-navy/20 to-transparent" />
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
      <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="heading-sans text-teal tracking-widest mb-3">Curated Selection</p>
            <h2 className="heading-serif text-3xl sm:text-4xl text-navy">Featured Equipment</h2>
          </div>
          <Link href="/products?filter=featured" className="hidden sm:inline-flex items-center gap-1.5 heading-sans text-ink-light hover:text-navy transition-colors duration-300">
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
