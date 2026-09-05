import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { getFeatureFlag, getActiveSubscriptionForContact, subscriptionPlanService, CHANNEL_ID } from "@/lib/store";
import { resolveFreeTrialOffer } from "@/lib/membership/free-trial";
import { subscribeOfferCopy } from "@/lib/membership/free-trial-copy";
import { SubscribeForm } from "./SubscribeForm";
import { stripePublishableKeyForScope, stripeScopeOf } from "@/lib/stripe";

export const metadata = {
  title: "Subscribe",
};

export default async function SubscribePage({
  params,
}: {
  params: Promise<{ planSlug: string }>;
}) {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/account");

  const { planSlug } = await params;

  const session = await getSession();
  if (!session) redirect(signInRedirect(`/account/membership/subscribe/${planSlug}`));

  // Redirect active subscribers back to membership page
  const activeSub = await getActiveSubscriptionForContact(session.contactId);
  if (activeSub) redirect("/account/membership");

  const plan = await subscriptionPlanService.getBySlugForChannel(CHANNEL_ID, planSlug);

  if (!plan) notFound();

  const metafields = plan.metafields as Record<string, string> | null;

  // What happens to this person's money before they hand over a card (card ASTb3tCf).
  // Three sentences are possible and only one of them is shown: the first months are
  // free; they have already had their free months, so it is the full price from today;
  // or nothing extra, because no free period is on offer to anybody. The offer is
  // decided by the SAME call `createSubscription` re-runs when it creates the
  // subscription, so nothing promised here can be quietly not honoured there. It is
  // resolved with no basket, because there is none on this page — a threshold, where
  // one is configured, is met by an order the shopper has already placed.
  const freeTrialNote = await resolveFreeTrialOffer({
    contactId: session.contactId,
    trialDays: Number(plan.trial_period_days) || 0,
    planPrice: plan.price,
  })
    .then((offer) => subscribeOfferCopy(offer.view))
    .catch(() => null);

  // THE PLAN'S ACCOUNT DECIDES — the same rule `createSubscription` follows
  // (card OHDx84DK). A plan's Stripe price, the customer and the subscription
  // all live inside ONE account, and the plan carries the marker saying which.
  // Reading the key off today's CHANNEL rule instead would mount Stripe.js on
  // this storefront's own `pk_live_` and then confirm a client secret from an
  // intent raised in the account the plan actually belongs to: `resource_missing`
  // for every new member between the day this storefront's keys are entered and
  // the day the plan is re-minted (Membership > Plans, "Move this plan"). Elements
  // and the intent address one account, exactly as they do at the checkout.
  //
  // `testMode` is the environment answer, the same one that picks the price id
  // below, and it drives the TEST MODE banner above the card field.
  const planScope = stripeScopeOf(plan);
  const { publishableKey: stripePublishableKey, testMode: wantTestMode } =
    await stripePublishableKeyForScope(planScope);

  // The page refuses on the SAME price id the action will use, so what we show is
  // what we accept: a plan re-minted onto a new account has no test price until
  // somebody mints one, and a dev build must say "not configured" rather than
  // present the old account's price.
  const planPriceId = wantTestMode ? metafields?.stripe_price_id_test : metafields?.stripe_price_id;

  if (!stripePublishableKey || !planPriceId) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="page-title mb-4">Subscribe</h1>
        <p className="text-sale">
          Payment is not properly configured. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="page-title mb-2">
        Subscribe to {plan.name}
      </h1>
      <p className="text-steel-500 mb-2">
        ${parseFloat(plan.price).toFixed(2)} / {plan.billing_interval}
      </p>
      {freeTrialNote && (
        <p className="mb-6 rounded-md border border-steel-200 bg-steel-50 px-3 py-2 text-sm text-ink-700">
          {freeTrialNote}
        </p>
      )}
      {!freeTrialNote && <div className="mb-6" />}

      <SubscribeForm
        planId={plan.id}
        stripePublishableKey={stripePublishableKey}
        testMode={wantTestMode}
      />
    </div>
  );
}
