import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight } from "lucide-react";
import { getProducts, getSiteConfig, getCategories, getFeatureFlag, getSubscriptionPlans, getUpcomingDraws, prizeService, CHANNEL_ID } from "@/lib/store";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { MembershipCTA } from "@/components/home/MembershipCTA";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";

export default async function HomePage() {
  const [{ channel }, { products: featuredProducts }, allCategories, memberPricingEnabled, subscriptionsEnabled, drawsEnabled] = await Promise.all([
    getSiteConfig(),
    getProducts({ featured: true, limit: 8 }),
    getCategories(),
    getFeatureFlag("member_pricing_enabled"),
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
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
  const planBenefits = plan ? ((plan.benefits as string[]) || []) : [];

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
      {subscriptionsEnabled && <ValueBar />}

      {/* Categories */}
      {topCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-zinc-900">Shop by Category</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group block rounded-xl overflow-hidden bg-white shadow-md hover:shadow-xl transition-shadow duration-300"
              >
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-4xl">
                      📦
                    </div>
                  )}
                </div>
                <div className="px-3 py-3">
                  <span className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-600 transition-colors line-clamp-2">
                    {category.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
