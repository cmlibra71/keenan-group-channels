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
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/membership-hero.webp')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-zinc-900/50 to-zinc-900/30" />
        <div className="relative z-10 container-page py-20 sm:py-28">
          <div className="backdrop-blur-xl bg-white/30 border border-white/25 rounded-[28px] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.15)] max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-white/30 text-white/80 text-xs font-bold uppercase tracking-[0.18em] px-4 py-1.5 mb-5 rounded-full">
              <Crown className="h-3.5 w-3.5" />
              From ${planPrice.toFixed(2)}/{plan.billingInterval}
            </div>
            <h1 className="hero-title text-white leading-[1.08]">
              Professional Kitchen Equipment at Members-Only Prices
            </h1>
            <p className="mt-5 text-base text-white/80 max-w-xl leading-relaxed">
              Join our membership and unlock exclusive pricing, monthly prize draws, and partner discounts.
            </p>
            {benefits.length > 0 && (
              <ul className="mt-6 space-y-2.5">
                {benefits.slice(0, 4).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70">
                    <span className="h-px w-4 bg-white/40 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                href="/account/register"
                className="inline-flex items-center justify-center gap-2 bg-teal-700 text-white px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-teal-800 transition-colors shadow-sm"
              >
                Start Your Membership
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#savings"
                className="inline-flex items-center justify-center gap-2 border border-white/30 bg-white/10 text-white px-7 py-3.5 rounded-[14px] font-semibold text-sm hover:bg-white/20 hover:border-white/50 transition-colors"
              >
                See What You&apos;ll Save
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="container-page section-padding">
        <div className="text-center mb-12">
          <p className="eyebrow mb-3">Benefits</p>
          <h2 className="section-title">Why Members Love It</h2>
          <p className="mt-3 text-text-secondary">Everything you get with your membership</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <BenefitCard
            icon="pricing"
            title="Members-Only Pricing"
            description="Save 10-25% off retail on all kitchen equipment. The more you buy, the more you save."
          />
          <BenefitCard
            icon="delivery"
            title="Australia-Wide Delivery"
            description="We deliver commercial kitchen equipment across Australia."
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
      <section id="draws" className="container-page section-padding">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="eyebrow mb-3">Draw Entries</p>
            <h2 className="section-title">The Longer You Stay, The Better Your Odds</h2>
            <p className="mt-3 text-text-secondary">
              Each month you&apos;re a member, you earn more entries. They accumulate and never reset (unless you cancel).
            </p>
          </div>
          <EntryAccumulationChart />
        </div>
      </section>

      {/* Savings Calculator */}
      <section id="savings" className="section-bordered">
        <div className="container-page section-padding">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <p className="eyebrow mb-3">Savings</p>
              <h2 className="section-title">Calculate Your Savings</h2>
              <p className="mt-3 text-text-secondary">
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
      <section className="container-page section-padding">
        <div className="max-w-md mx-auto text-center">
          <div className="border border-text-primary p-10">
            <Crown className="h-8 w-8 text-accent mx-auto mb-5" />
            <h2 className="heading-serif text-2xl text-text-primary mb-2">{plan.name}</h2>
            <p className="heading-serif text-4xl text-text-primary mb-1">
              ${planPrice.toFixed(2)}
              <span className="text-base font-normal text-text-secondary">/{plan.billingInterval}</span>
            </p>
            {plan.description && (
              <p className="text-sm text-text-secondary mb-5">{plan.description}</p>
            )}
            {benefits.length > 0 && (
              <ul className="text-left space-y-2.5 mb-8">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-text-body">
                    <Check className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/account/register"
              className="btn-primary w-full"
            >
              Start Your Membership
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
