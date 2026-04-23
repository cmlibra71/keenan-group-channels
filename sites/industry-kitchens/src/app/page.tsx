import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import { getProducts, getSiteConfig, getTopCategories, getFeatureFlag, getSubscriptionPlans, getUpcomingDraws, getBrandsForChannel, prizeService, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { MembershipCTA } from "@/components/home/MembershipCTA";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { BrandShowcase } from "@/components/home/BrandShowcase";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, { products: clearanceProducts }, topCategories, allBrands, memberPricingEnabled, subscriptionsEnabled, drawsEnabled] = await Promise.all([
    getSiteConfig(),
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onSale: true, limit: 9 }),
    getTopCategories(),
    getBrandsForChannel(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
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
      {/* Hero */}
      {subscriptionsEnabled && plan ? (
        <section className="bg-zinc-900 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              {/* Left */}
              <div>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                  Professional Kitchen Equipment at Members-Only Prices
                </h1>
                <p className="mt-4 text-lg text-zinc-300">
                  From ${planPrice!.toFixed(2)}/{plan.billingInterval} — unlock exclusive member pricing on everything.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/membership"
                    className="inline-flex items-center justify-center gap-2 bg-amber-500 text-zinc-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 transition-colors"
                  >
                    Join & Save
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/products"
                    className="inline-flex items-center justify-center gap-2 border border-zinc-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
                  >
                    Shop All Products
                  </Link>
                </div>
              </div>

              {/* Right — featured prize or membership card */}
              <div>
                {featuredPrize ? (
                  <Link href="/membership#draws" className="block rounded-2xl border border-zinc-700 bg-zinc-800/50 p-6 hover:border-amber-500/30 transition-colors">
                    <p className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-3">
                      Members-Only Prize Draw
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="relative h-24 w-24 rounded-lg bg-zinc-700 overflow-hidden shrink-0">
                        {featuredPrize.imageUrl ? (
                          <Image
                            src={featuredPrize.imageUrl}
                            alt={featuredPrize.name}
                            fill
                            sizes="96px"
                            className="object-contain"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Crown className="h-8 w-8 text-amber-400/30" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{featuredPrize.name}</h3>
                        {featuredPrize.value && parseFloat(featuredPrize.value) > 0 && (
                          <p className="text-lg font-bold text-amber-400">
                            Valued at ${parseFloat(featuredPrize.value).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                        {featuredDraw?.scheduledAt && (
                          <p className="text-xs text-zinc-400 mt-1">
                            Draw: {new Date(featuredDraw.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-6">
                    <Crown className="h-8 w-8 text-amber-400 mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">Member Benefits</h3>
                    <ul className="space-y-2">
                      {planBenefits.slice(0, 4).map((b, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
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
        <section className="bg-zinc-900 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Welcome to {channel?.name || "our store"}
            </h1>
            <p className="mt-4 text-lg text-zinc-300 max-w-xl">
              Discover our curated collection of quality products.
            </p>
            <Link
              href="/products"
              className="mt-8 inline-block bg-white text-zinc-900 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-100 transition-colors"
            >
              Shop All Products
            </Link>
          </div>
        </section>
      )}

      {/* Value Bar */}
      {subscriptionsEnabled && <ValueBar drawsEnabled={drawsEnabled} />}

      {/* Categories */}
      {topCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 mb-3">Departments</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">Shop by Category</h2>
            </div>
            <Link href="/categories" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
              View All
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {topCategories.map((category: { id: number; name: string; slug: string; imageUrl?: string | null }) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative overflow-hidden rounded-2xl bg-zinc-200 aspect-[4/5] ring-1 ring-transparent hover:ring-amber-400/30 transition-all duration-500"
              >
                <div className="absolute inset-0 overflow-hidden">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-zinc-200 to-zinc-100 flex items-center justify-center text-4xl">
                      📦
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/85 via-zinc-900/35 to-zinc-900/5 group-hover:from-zinc-900/90 transition-colors duration-500" />
                </div>
                <div className="relative h-full flex flex-col justify-end p-5 sm:p-6">
                  <span className="text-lg sm:text-xl lg:text-2xl font-semibold text-white drop-shadow-sm transform translate-y-1 group-hover:translate-y-0 transition-transform duration-500 ease-out">
                    {category.name}
                  </span>
                  <span className="block h-px w-0 group-hover:w-10 bg-amber-400 mt-2 transition-all duration-500 ease-out" />
                  <span className="mt-3 inline-flex items-center text-[11px] uppercase tracking-[0.18em] text-white/70 group-hover:text-white transition-colors duration-300">
                    Explore
                    <ChevronRight className="h-3 w-3 ml-1 transform translate-x-0 group-hover:translate-x-1 transition-transform duration-300" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Brand Showcase */}
      <BrandShowcase brands={featuredBrands} />

      {/* Clearance Spotlight */}
      <ClearanceSpotlight products={clearanceProducts} />

      {/* Membership CTA Banner */}
      {subscriptionsEnabled && plan && (
        <MembershipCTA
          planPrice={planPrice!}
          billingInterval={plan.billingInterval}
          benefits={planBenefits}
        />
      )}

      {/* Featured Products */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-zinc-900">Featured Products</h2>
          <Link href="/products?filter=featured" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            View all &rarr;
          </Link>
        </div>
        <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} />
      </section>

      {/* Draw Spotlight */}
      {drawsEnabled && featuredPrize && (
        <DrawSpotlight prize={featuredPrize} draw={featuredDraw} />
      )}
    </div>
  );
}
