import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Crown, ArrowRight } from "lucide-react";
import {
  getSubscriptionPlans,
  getUpcomingDraws,
  getPartnerOffers,
  getFeatureFlag,
  prizeService,
  CHANNEL_ID,
} from "@/lib/store";
import { BenefitCard } from "@/components/membership/BenefitCard";
import { PrizeShowcase } from "@/components/membership/PrizeShowcase";
import { EntryAccumulationChart } from "@/components/membership/EntryAccumulationChart";
import { SavingsCalculator } from "@/components/membership/SavingsCalculator";
import { WinnerSpotlight } from "@/components/membership/WinnerSpotlight";
import { PartnerLogos } from "@/components/membership/PartnerLogos";

export const metadata = {
  title: "Membership",
  description: "Join our membership program for exclusive pricing, prize draws, and partner discounts.",
};

export default async function MembershipLandingPage() {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/");

  const [plans, upcomingDraws, partnerOffers, activePrizes] = await Promise.all([
    getSubscriptionPlans(),
    getUpcomingDraws(),
    getPartnerOffers(),
    prizeService.listActiveForChannel(CHANNEL_ID),
  ]);

  const plan = plans[0]; // Primary plan
  if (!plan) redirect("/");

  const planPrice = parseFloat(plan.price);
  const benefits = (plan.benefits as string[]) || [];

  // Find highest-value prize
  const featuredPrize = activePrizes.length > 0
    ? activePrizes.reduce((best, p) => {
        const val = p.value ? parseFloat(p.value) : 0;
        const bestVal = best.value ? parseFloat(best.value) : 0;
        return val > bestVal ? p : best;
      })
    : null;

  // Find the draw associated with the featured prize (first upcoming draw)
  const featuredDraw = upcomingDraws[0] ?? null;

  return (
    <div>
      {/* Hero */}
      <section className="bg-zinc-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium px-3 py-1 rounded-full mb-6">
              <Crown className="h-3.5 w-3.5" />
              From ${planPrice.toFixed(2)}/{plan.billingInterval}
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              Professional Kitchen Equipment at Members-Only Prices
            </h1>
            <p className="mt-4 text-lg text-zinc-300 max-w-xl">
              Join our membership and unlock exclusive pricing, free delivery, monthly prize draws, and partner discounts.
            </p>
            {benefits.length > 0 && (
              <ul className="mt-6 space-y-2">
                {benefits.slice(0, 4).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-2 text-zinc-300">
                    <Check className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href={`/account/membership/subscribe/${plan.slug}`}
                className="inline-flex items-center justify-center gap-2 bg-amber-500 text-zinc-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 transition-colors"
              >
                Start Your Membership
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#savings"
                className="inline-flex items-center justify-center gap-2 border border-zinc-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
              >
                See What You&apos;ll Save
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-zinc-900">Why Members Love It</h2>
          <p className="mt-2 text-zinc-600">Everything you get with your membership</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <BenefitCard
            icon="pricing"
            title="Members-Only Pricing"
            description="Save 10-25% off retail on all kitchen equipment. The more you buy, the more you save."
          />
          <BenefitCard
            icon="delivery"
            title="Free Delivery $500+"
            description="Free shipping on orders over $500. No code needed, automatically applied at checkout."
          />
          <BenefitCard
            icon="draws"
            title="Prize Draws"
            description="Automatic entry into monthly, quarterly, and grand prize draws. Entries accumulate the longer you stay."
          />
          <BenefitCard
            icon="partners"
            title="Partner Discounts"
            description="Exclusive discount codes from our partner network, only available to members."
          />
        </div>
      </section>

      {/* Featured Prize Showcase */}
      {featuredPrize && (
        <PrizeShowcase prize={featuredPrize} draw={featuredDraw} />
      )}

      {/* Entry Accumulation */}
      <section id="draws" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-zinc-900">The Longer You Stay, The Better Your Odds</h2>
            <p className="mt-2 text-zinc-600">
              Each month you&apos;re a member, you earn more entries. They accumulate and never reset (unless you cancel).
            </p>
          </div>
          <EntryAccumulationChart />
        </div>
      </section>

      {/* Savings Calculator */}
      <section id="savings" className="bg-zinc-50 border-y border-zinc-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-zinc-900">Calculate Your Savings</h2>
              <p className="mt-2 text-zinc-600">
                See how much you could save with a membership
              </p>
            </div>
            <SavingsCalculator monthlyPlanPrice={planPrice} />
          </div>
        </div>
      </section>

      {/* Winner Spotlight / Upcoming Draws */}
      <WinnerSpotlight upcomingDraws={upcomingDraws} />

      {/* Partner Logos */}
      <PartnerLogos offers={partnerOffers} />

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-md mx-auto text-center">
          <div className="rounded-2xl border-2 border-zinc-900 p-8">
            <Crown className="h-10 w-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-zinc-900 mb-1">{plan.name}</h2>
            <p className="text-4xl font-bold text-zinc-900 mb-1">
              ${planPrice.toFixed(2)}
              <span className="text-base font-normal text-zinc-500">/{plan.billingInterval}</span>
            </p>
            {plan.description && (
              <p className="text-sm text-zinc-600 mb-4">{plan.description}</p>
            )}
            {benefits.length > 0 && (
              <ul className="text-left space-y-2 mb-6">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/account/membership/subscribe/${plan.slug}`}
              className="block w-full text-center bg-amber-500 text-zinc-900 py-3 px-6 rounded-lg font-semibold hover:bg-amber-400 transition-colors"
            >
              Start Your Membership
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
