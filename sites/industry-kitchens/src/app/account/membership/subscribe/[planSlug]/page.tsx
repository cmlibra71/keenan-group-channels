import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, subscriptionPlanService, CHANNEL_ID } from "@/lib/store";
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

  const { planSlug } = await params;
  const plan = await subscriptionPlanService.getBySlugForChannel(CHANNEL_ID, planSlug);

  if (!plan) notFound();

  const metafields = plan.metafields as Record<string, string> | null;
  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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
        ${parseFloat(plan.price).toFixed(2)} / {plan.billingInterval}
      </p>

      <SubscribeForm
        planId={plan.id}
        stripePublishableKey={stripePublishableKey}
      />
    </div>
  );
}
