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
      <section className="relative bg-navy overflow-hidden grain">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-teal/5 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-teal/30 text-teal text-sm font-medium px-4 py-1.5 mb-6">
              <Crown className="h-3.5 w-3.5" />
              From ${planPrice.toFixed(2)}/{plan.billingInterval}
            </div>
            <h1 className="heading-serif text-4xl sm:text-5xl text-white">
              Professional Kitchen Equipment at Members-Only Prices
            </h1>
            <p className="mt-5 text-lg text-slate-400 max-w-xl leading-relaxed font-light">
              Join our membership and unlock exclusive pricing, free delivery, monthly prize draws, and partner discounts.
            </p>
            {benefits.length > 0 && (
              <ul className="mt-6 space-y-2.5">
                {benefits.slice(0, 4).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-400">
                    <span className="h-px w-4 bg-teal/60 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href={`/account/membership/subscribe/${plan.slug}`}
                className="inline-flex items-center justify-center gap-2.5 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
              >
                Start Your Membership
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#savings"
                className="inline-flex items-center justify-center gap-2.5 border border-slate-600 text-slate-300 px-7 py-3.5 font-medium text-sm tracking-wide hover:border-slate-400 hover:text-white transition-colors duration-300"
              >
                See What You&apos;ll Save
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="heading-sans text-teal tracking-widest mb-3">Benefits</p>
          <h2 className="heading-serif text-3xl sm:text-4xl text-navy">Why Members Love It</h2>
          <p className="mt-3 text-ink-light">Everything you get with your membership</p>
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
      <section id="draws" className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="heading-sans text-teal tracking-widest mb-3">Draw Entries</p>
            <h2 className="heading-serif text-3xl sm:text-4xl text-navy">The Longer You Stay, The Better Your Odds</h2>
            <p className="mt-3 text-ink-light">
              Each month you&apos;re a member, you earn more entries. They accumulate and never reset (unless you cancel).
            </p>
          </div>
          <EntryAccumulationChart />
        </div>
      </section>

      {/* Savings Calculator */}
      <section id="savings" className="border-y border-stone bg-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <p className="heading-sans text-teal tracking-widest mb-3">Savings</p>
              <h2 className="heading-serif text-3xl sm:text-4xl text-navy">Calculate Your Savings</h2>
              <p className="mt-3 text-ink-light">
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
      <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-24">
        <div className="max-w-md mx-auto text-center">
          <div className="border border-navy p-10">
            <Crown className="h-8 w-8 text-teal mx-auto mb-5" />
            <h2 className="heading-serif text-2xl text-navy mb-2">{plan.name}</h2>
            <p className="heading-serif text-4xl text-navy mb-1">
              ${planPrice.toFixed(2)}
              <span className="text-base font-normal text-ink-light">/{plan.billingInterval}</span>
            </p>
            {plan.description && (
              <p className="text-sm text-ink-light mb-5">{plan.description}</p>
            )}
            {benefits.length > 0 && (
              <ul className="text-left space-y-2.5 mb-8">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-ink">
                    <Check className="h-4 w-4 text-teal mt-0.5 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/account/membership/subscribe/${plan.slug}`}
              className="block w-full text-center bg-teal text-white py-3.5 px-6 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
            >
              Start Your Membership
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
