import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getActiveSubscription, subscriptionPlanService, CHANNEL_ID } from "@/lib/store";
import { resolveStripeGateway } from "@/lib/payments/gateway";
import { SubscribeForm } from "./SubscribeForm";

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

  const session = await getSession();
  if (!session) redirect("/account");

  // Redirect active subscribers back to membership page
  const activeSub = await getActiveSubscription(session.customerId);
  if (activeSub) redirect("/account/membership");

  const { planSlug } = await params;
  const plan = await subscriptionPlanService.getBySlugForChannel(CHANNEL_ID, planSlug);

  if (!plan) notFound();

  const metafields = plan.metafields as Record<string, string> | null;

  // Read publishable_key from the portal-wide payment_gateways setting (same
  // place the cart checkout reads it from). Comment in checkout/page.tsx:
  // "All channels share one Stripe account; segmentation happens via metadata."
  // wantTestMode also drives the TEST MODE banner shown above the card field.
  const { gateway: stripeGateway, wantTestMode } = await resolveStripeGateway();
  const stripePublishableKey: string | undefined = stripeGateway?.credentials?.publishable_key;

  if (!stripePublishableKey || !metafields?.stripe_price_id) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">Subscribe</h1>
        <p className="text-red-600">
          Payment is not properly configured. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Subscribe to {plan.name}
      </h1>
      <p className="text-zinc-600 mb-6">
        ${parseFloat(plan.price).toFixed(2)} / {plan.billing_interval}
      </p>

      <SubscribeForm
        planId={plan.id}
        stripePublishableKey={stripePublishableKey}
        testMode={wantTestMode}
      />
    </div>
  );
}
