import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getActiveSubscription, subscriptionPlanService, storeSettingsService, CHANNEL_ID, wantStripeTestMode } from "@/lib/store";
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
  const wantTestMode = await wantStripeTestMode();
  let stripePublishableKey: string | undefined;
  try {
    const gatewaysSetting = await storeSettingsService.getByKey("payment_gateways");
    const gateways = (gatewaysSetting.setting_value as { provider: string; credentials: Record<string, string>; enabled?: boolean; testMode?: boolean }[]) || [];
    // Match the gateway entry tagged for the current environment: testMode=true
    // in dev, testMode=false in prod. Lets both modes coexist in the DB row.
    const stripeGateway = gateways.find((g) => g.provider === "stripe" && g.enabled !== false && Boolean(g.testMode) === wantTestMode) ?? (wantTestMode ? gateways.find((g) => g.provider === "stripe" && g.enabled !== false) : undefined);
    stripePublishableKey = stripeGateway?.credentials?.publishable_key;
  } catch {}

  if (!stripePublishableKey || !metafields?.stripe_price_id) {
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
      <p className="text-steel-500 mb-6">
        ${parseFloat(plan.price).toFixed(2)} / {plan.billingInterval}
      </p>

      <SubscribeForm
        planId={plan.id}
        stripePublishableKey={stripePublishableKey}
        testMode={wantTestMode}
      />
    </div>
  );
}
