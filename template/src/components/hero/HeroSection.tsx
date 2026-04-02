import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight } from "lucide-react";
import HeroWaveBackground from "./HeroWaveBackground";

interface HeroSectionProps {
  subscriptionsEnabled: boolean;
  channel: { name: string } | null;
  plan: { price: string; billingInterval: string; slug: string; benefits: unknown } | null;
  featuredPrize: { id: number; name: string; imageUrl: string | null; value: string | null } | null;
  featuredDraw: { id: number; name: string; scheduledAt: string | Date | null } | null;
  heroImageCount: number;
}

export function HeroSection({
  subscriptionsEnabled,
  channel,
  plan,
  featuredPrize,
  featuredDraw,
  heroImageCount,
}: HeroSectionProps) {
  const planPrice = plan ? parseFloat(plan.price) : null;
  const planBenefits = plan ? ((plan.benefits as string[]) || []) : [];

  return (
    <section className="relative bg-zinc-900 text-white overflow-hidden" style={{ minHeight: "500px" }}>
      {heroImageCount > 0 && (
        <HeroWaveBackground imageCount={heroImageCount} />
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {subscriptionsEnabled && plan ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left */}
            <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
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
                <Link href="/membership#draws" className="block backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-6 hover:border-amber-500/30 transition-colors shadow-2xl">
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
                <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
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
        ) : (
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl max-w-xl">
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
        )}
      </div>
    </section>
  );
}
