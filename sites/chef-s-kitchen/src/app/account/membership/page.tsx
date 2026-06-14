import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, AlertTriangle, Clock } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getSubscriptionPlans,
  getActiveSubscription,
  getFeatureFlag,
  subscriptionService,
  drawEntryService,
  CHANNEL_ID,
} from "@/lib/store";
import { CancelConfirmationModal } from "@/components/membership/CancelConfirmationModal";
import { ManageBillingButton } from "@/components/membership/ManageBillingButton";
import { getMembershipProfile } from "@/lib/membership";

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
    // Required onboarding gate: bounce members missing business/billing details.
    const profile = await getMembershipProfile(session.customerId);
    if (!profile.complete) redirect("/account/membership/complete-profile");

    const drawsEnabled = await getFeatureFlag("draws_enabled");
    let totalEntries = 0;
    if (drawsEnabled) {
      const entries = await drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID);
      totalEntries = entries?.length ?? 0;
    }

    const isPastDue = activeSub.status === "past_due";
    const isCancelling = activeSub.cancelAtPeriodEnd;

    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="page-title mb-8">Membership</h1>

        {/* Past due warning */}
        {isPastDue && (
          <div className="border border-sale/30 bg-sale-bg rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-sale shrink-0" />
              <p className="text-sale-deep text-sm font-medium">
                Your last payment failed. Please update your payment method to keep your membership active.
              </p>
            </div>
          </div>
        )}

        {/* Cancelling notice */}
        {isCancelling && (
          <div className="border border-member/40 bg-member-bg rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-member-text shrink-0" />
              <p className="text-member-text text-sm font-medium">
                Your membership is set to cancel. Benefits remain active until{" "}
                {activeSub.currentPeriodEnd
                  ? new Date(activeSub.currentPeriodEnd).toLocaleDateString()
                  : "the end of your billing period"}.
              </p>
            </div>
          </div>
        )}

        <div className={`border rounded-lg p-6 mb-6 ${
          isPastDue
            ? "border-sale/30 bg-sale-bg"
            : isCancelling
              ? "border-member/40 bg-member-bg"
              : "border-brand-light/40 bg-brand-tint"
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <Check className={`h-5 w-5 ${isPastDue ? "text-sale" : isCancelling ? "text-member-text" : "text-brand"}`} />
            <h2 className={`text-lg font-semibold ${isPastDue ? "text-sale-deep" : isCancelling ? "text-warning" : "text-brand-deep"}`}>
              {isPastDue ? "Payment Issue" : isCancelling ? "Cancelling" : "Active Member"}
            </h2>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-steel-500">Status</dt>
              <dd className="font-medium text-ink-900">
                {isPastDue ? "Past Due" : isCancelling ? "Cancelling" : "Active"}
              </dd>
            </div>
            <div>
              <dt className="text-steel-500">Consecutive Months</dt>
              <dd className="font-medium text-ink-900">{activeSub.consecutiveMonths ?? 0}</dd>
            </div>
            {activeSub.currentPeriodEnd && (
              <div>
                <dt className="text-steel-500">
                  {isCancelling ? "Benefits End" : "Next Billing Date"}
                </dt>
                <dd className="font-medium text-ink-900">
                  {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}
                </dd>
              </div>
            )}
            {drawsEnabled && (
              <div>
                <dt className="text-steel-500">Draw Entries</dt>
                <dd className="font-medium text-ink-900">{totalEntries}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Account details summary */}
        <div className="border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink-900">Account details</h2>
            <Link href="/account/profile" className="text-sm font-semibold text-accent hover:text-accent-hover">
              Edit details
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-steel-500">Business</dt>
              <dd className="font-medium text-ink-900">{(profile.customer?.company as string) || "—"}</dd>
            </div>
            <div>
              <dt className="text-steel-500">Phone</dt>
              <dd className="font-medium text-ink-900">{(profile.customer?.phone as string) || "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-steel-500">Default billing address</dt>
              <dd className="font-medium text-ink-900">
                {profile.defaultBilling
                  ? [
                      profile.defaultBilling.address1,
                      profile.defaultBilling.address2,
                      profile.defaultBilling.city,
                      profile.defaultBilling.state_or_province,
                      profile.defaultBilling.postal_code,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <ManageBillingButton />
          {!activeSub.cancelAtPeriodEnd && (
            <CancelConfirmationModal
              currentPeriodEnd={activeSub.currentPeriodEnd ? String(activeSub.currentPeriodEnd) : null}
              totalEntries={totalEntries}
              consecutiveMonths={activeSub.consecutiveMonths ?? 0}
            />
          )}
        </div>
      </div>
    );
  }

  // Check if this is a returning member (has previous subscriptions)
  const previousSubs = await subscriptionService.listForCustomer(session.customerId, CHANNEL_ID);
  const isReturningMember = previousSubs.length > 0;

  // Show available plans
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="page-title mb-2">
        {isReturningMember ? "Welcome Back" : "Membership"}
      </h1>
      <p className="text-steel-500 mb-8">
        {isReturningMember
          ? "Rejoin to restore your benefits."
          : "Join our membership program for exclusive pricing and benefits."}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => {
          const benefits = (plan.benefits as string[]) || [];
          return (
            <div
              key={plan.id}
              className="border border-steel-200 rounded-lg p-6 hover:border-steel-400 transition-colors"
            >
              <h2 className="text-xl font-semibold text-ink-900 mb-1">
                {plan.name}
              </h2>
              <p className="text-3xl font-bold text-ink-900 mb-1">
                ${parseFloat(plan.price).toFixed(2)}
                <span className="text-base font-normal text-steel-500">
                  /{plan.billingInterval}
                </span>
              </p>
              {plan.description && (
                <p className="text-sm text-steel-500 mb-4">{plan.description}</p>
              )}
              {benefits.length > 0 && (
                <ul className="space-y-2 mb-6">
                  {benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                      <Check className="h-4 w-4 text-brand mt-0.5 shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/account/membership/subscribe/${plan.slug}`}
                className="btn-primary btn-sm w-full"
              >
                {isReturningMember ? "Rejoin" : "Subscribe"}
              </Link>
            </div>
          );
        })}
      </div>

      {plans.length === 0 && (
        <p className="text-steel-500 text-center py-12">
          No membership plans are currently available.
        </p>
      )}
    </div>
  );
}
