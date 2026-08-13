import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, AlertTriangle, Clock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { formatMemberSince } from "@/lib/member-date";
import { signInRedirect } from "@/lib/account-redirect";
import {
  getSubscriptionPlans,
  getActiveSubscriptionForContact,
  getMemberSince,
  getFeatureFlag,
  subscriptionService,
  drawEntryService,
  CHANNEL_ID,
} from "@/lib/store";
import { CancelConfirmationModal } from "@/components/membership/CancelConfirmationModal";
import { ManageBillingButton } from "@/components/membership/ManageBillingButton";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = {
  title: "Membership",
};

export default async function MembershipPage() {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/account");

  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/membership"));

  const [plans, activeSub, memberSince] = await Promise.all([
    getSubscriptionPlans(),
    getActiveSubscriptionForContact(session.contactId),
    getMemberSince(session.contactId),
  ]);
  // Melbourne, always — see member-date.ts.
  const memberSinceLabel = formatMemberSince(memberSince);

  // If user has active subscription, show status
  if (activeSub) {
    const drawsEnabled = await getFeatureFlag("draws_enabled");
    let totalEntries = 0;
    if (drawsEnabled) {
      const entries = await drawEntryService.getEntriesForContact(session.contactId, CHANNEL_ID);
      totalEntries = entries?.length ?? 0;
    }

    const isPastDue = activeSub.status === "past_due";
    const isCancelling = activeSub.cancel_at_period_end;

    return (
      <AccountShell>
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Membership</h1>

        {/* Past due warning */}
        {isPastDue && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <p className="text-red-800 text-sm font-medium">
                Your last payment failed. Please update your payment method to keep your membership active.
              </p>
            </div>
          </div>
        )}

        {/* Cancelling notice */}
        {isCancelling && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-amber-800 text-sm font-medium">
                Your membership is set to cancel. Benefits remain active until{" "}
                {activeSub.current_period_end
                  ? formatMemberSince(activeSub.current_period_end)
                  : "the end of your billing period"}.
              </p>
            </div>
          </div>
        )}

        <div className={`border rounded-lg p-6 mb-6 ${
          isPastDue
            ? "border-red-200 bg-red-50"
            : isCancelling
              ? "border-amber-200 bg-amber-50"
              : "border-green-200 bg-green-50"
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <Check className={`h-5 w-5 ${isPastDue ? "text-red-600" : isCancelling ? "text-amber-600" : "text-green-600"}`} />
            <h2 className={`text-lg font-semibold ${isPastDue ? "text-red-900" : isCancelling ? "text-amber-900" : "text-green-900"}`}>
              {isPastDue ? "Payment Issue" : isCancelling ? "Cancelling" : "Active Member"}
            </h2>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="font-medium text-zinc-900">
                {isPastDue ? "Past Due" : isCancelling ? "Cancelling" : "Active"}
              </dd>
            </div>
            {memberSinceLabel && (
              <div>
                <dt className="text-zinc-500">Member since</dt>
                <dd className="font-medium text-zinc-900">
                  {memberSinceLabel}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500">Consecutive Months</dt>
              <dd className="font-medium text-zinc-900">{activeSub.consecutive_months ?? 0}</dd>
            </div>
            {activeSub.current_period_end && (
              <div>
                <dt className="text-zinc-500">
                  {isCancelling ? "Benefits End" : "Next Billing Date"}
                </dt>
                <dd className="font-medium text-zinc-900">
                  {formatMemberSince(activeSub.current_period_end)}
                </dd>
              </div>
            )}
            {drawsEnabled && (
              <div>
                <dt className="text-zinc-500">Draw Entries</dt>
                <dd className="font-medium text-zinc-900">{totalEntries}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <ManageBillingButton />
          {!activeSub.cancel_at_period_end && (
            <CancelConfirmationModal
              currentPeriodEnd={activeSub.current_period_end ? String(activeSub.current_period_end) : null}
              totalEntries={totalEntries}
              consecutiveMonths={activeSub.consecutive_months ?? 0}
            />
          )}
        </div>
      </AccountShell>
    );
  }

  // Check if this is a returning member (has previous subscriptions)
  const previousSubs = await subscriptionService.listForContact(session.contactId, CHANNEL_ID);
  const isReturningMember = previousSubs.length > 0;

  // Show available plans
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">
        {isReturningMember ? "Welcome Back" : "Membership"}
      </h1>
      <p className="text-zinc-600 mb-8">
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
              className="border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
            >
              <h2 className="text-xl font-semibold text-zinc-900 mb-1">
                {plan.name}
              </h2>
              <p className="text-3xl font-bold text-zinc-900 mb-1">
                ${parseFloat(plan.price).toFixed(2)}
                <span className="text-base font-normal text-zinc-500">
                  /{plan.billing_interval}
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
                {isReturningMember ? "Rejoin" : "Subscribe"}
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
