import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getSubscriptionPlans,
  getActiveSubscription,
  getFeatureFlag,
  subscriptionService,
} from "@/lib/store";
import { cancelSubscription } from "@/lib/actions/subscription";

export const metadata = {
  title: "Membership",
};

export default async function MembershipPage() {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect("/account");

  const [plans, activeSub] = await Promise.all([
    getSubscriptionPlans(),
    getActiveSubscription(session.customerId),
  ]);

  // If user has active subscription, show status
  if (activeSub) {
    const subDetails = await subscriptionService.getById(activeSub.id, ["events"]);

    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Membership</h1>

        <div className="border border-green-200 bg-green-50 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-900">Active Member</h2>
          </div>
          <p className="text-green-700 text-sm">
            Your membership is {activeSub.cancelAtPeriodEnd ? "set to cancel at the end of the current period" : "active and renewing"}.
          </p>
          {activeSub.currentPeriodEnd && (
            <p className="text-green-600 text-sm mt-1">
              Current period ends: {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
          <p className="text-green-600 text-sm mt-1">
            Consecutive months: {activeSub.consecutiveMonths ?? 0}
          </p>
        </div>

        {!activeSub.cancelAtPeriodEnd && (
          <form action={async () => {
            "use server";
            await cancelSubscription();
          }}>
            <button
              type="submit"
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Cancel membership
            </button>
          </form>
        )}
      </div>
    );
  }

  // Show available plans
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">Membership</h1>
      <p className="text-zinc-600 mb-8">
        Join our membership program for exclusive pricing and benefits.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => {
          const benefits = (plan.benefits as string[]) || [];
          return (
            <div
              key={plan.id}
              className="border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
            >
              <h2 className="text-xl font-semibold text-zinc-900 mb-1">
                {plan.name}
              </h2>
              <p className="text-3xl font-bold text-zinc-900 mb-1">
                ${parseFloat(plan.price).toFixed(2)}
                <span className="text-base font-normal text-zinc-500">
                  /{plan.billingInterval}
                </span>
              </p>
              {plan.description && (
                <p className="text-sm text-zinc-600 mb-4">{plan.description}</p>
              )}
              {benefits.length > 0 && (
                <ul className="space-y-2 mb-6">
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
                className="block w-full text-center bg-zinc-900 text-white py-2 px-4 rounded-lg hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                Subscribe
              </Link>
            </div>
          );
        })}
      </div>

      {plans.length === 0 && (
        <p className="text-zinc-500 text-center py-12">
          No membership plans are currently available.
        </p>
      )}
    </div>
  );
}
