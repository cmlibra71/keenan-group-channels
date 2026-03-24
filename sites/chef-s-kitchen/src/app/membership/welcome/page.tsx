import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Gift, ShoppingBag } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getActiveSubscription, getFeatureFlag } from "@/lib/store";

export const metadata = {
  title: "Welcome to Membership",
};

export default async function MembershipWelcomePage() {
  const session = await getSession();
  if (!session) redirect("/account");

  const activeSub = await getActiveSubscription(session.customerId);
  if (!activeSub) redirect("/membership");

  const drawsEnabled = await getFeatureFlag("draws_enabled");
  const partnerOffersEnabled = await getFeatureFlag("partner_offers_enabled");

  return (
    <div className="mx-auto max-w-2xl px-6 lg:px-8 section-padding text-center">
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 mb-4">
          <Check className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-3xl heading-serif text-text-primary mb-3">
          Welcome to Membership!
        </h1>
        <p className="text-text-secondary text-lg">
          Your membership is now active. Here&apos;s what you&apos;ve unlocked:
        </p>
      </div>

      <div className="space-y-4 text-left mb-8">
        <div className="border border-border p-4 flex items-start gap-3">
          <ShoppingBag className="h-5 w-5 text-accent mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-text-primary">Member-Exclusive Pricing</p>
            <p className="text-sm text-text-secondary">Save up to 25% on products across the store.</p>
          </div>
        </div>

        {drawsEnabled && (
          <div className="border border-border p-4 flex items-start gap-3">
            <Gift className="h-5 w-5 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-text-primary">Your First Raffle Entry Has Been Added!</p>
              <p className="text-sm text-text-secondary">You&apos;ll receive a new entry each month you stay subscribed.</p>
            </div>
          </div>
        )}

        {partnerOffersEnabled && (
          <div className="border border-border p-4 flex items-start gap-3">
            <Check className="h-5 w-5 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-text-primary">Partner Offers & Discounts</p>
              <p className="text-sm text-text-secondary">Access exclusive deals from our partner brands.</p>
            </div>
          </div>
        )}
      </div>

      <Link
        href="/products"
        className="btn-primary inline-block"
      >
        Start Shopping
      </Link>
    </div>
  );
}
