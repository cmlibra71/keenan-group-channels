"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  subscriptionPlanService,
  subscriptionService,
  customerService,
  channelSettingsService,
} from "@/lib/store";
import { StripeSubscriptionProvider } from "@keenan/services";

async function getStripeProvider(): Promise<StripeSubscriptionProvider> {
  const settings = await channelSettingsService.getByKey(CHANNEL_ID, "payment_gateways");
  const gateways = (settings.setting_value as { provider: string; credentials: Record<string, string> }[]) || [];
  const stripe = gateways.find((g) => g.provider === "stripe");
  if (!stripe?.credentials?.secret_key) {
    throw new Error("Stripe is not configured for this channel.");
  }
  return new StripeSubscriptionProvider(stripe.credentials.secret_key);
}

/**
 * Create a subscription for the current customer.
 * Returns the Stripe client secret for payment confirmation.
 */
export async function createSubscription(planId: number): Promise<{
  success: boolean;
  clientSecret?: string | null;
  subscriptionId?: number;
  error?: string;
}> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan) {
      return { success: false, error: "Plan not found" };
    }

    const customer = await customerService.getById(session.customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    // Check for existing active subscription
    const existing = await subscriptionService.getActiveForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    if (existing) {
      return { success: false, error: "You already have an active subscription" };
    }

    // Check for pending subscription that hasn't been activated yet
    const allSubs = await subscriptionService.listForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    const pendingSub = allSubs.find((s) => s.status === "pending");
    if (pendingSub) {
      return { success: false, error: "You have a pending subscription being processed" };
    }

    const stripeProvider = await getStripeProvider();

    // Get or create Stripe customer
    const stripeCustomerId = await stripeProvider.getOrCreateCustomer(
      customer.email as string,
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || undefined,
      {
        channel_id: String(CHANNEL_ID),
        customer_id: String(session.customerId),
      }
    );

    // Get Stripe price ID from plan metafields
    const metafields = plan.metafields as Record<string, string> | null;
    const stripePriceId = metafields?.stripe_price_id;
    if (!stripePriceId) {
      return { success: false, error: "Plan is not properly configured" };
    }

    // Create Stripe subscription
    const stripeSub = await stripeProvider.createSubscription(
      stripeCustomerId,
      stripePriceId,
      {
        trialPeriodDays: (plan.trial_period_days as number) || 0,
        metadata: {
          channel_id: String(CHANNEL_ID),
          customer_id: String(session.customerId),
          plan_id: String(planId),
        },
      }
    );

    // Create local subscription record
    const localSub = await subscriptionService.create({
      channelId: CHANNEL_ID,
      customerId: session.customerId,
      planId: planId,
      status: "pending",
      stripeSubscriptionId: stripeSub.subscriptionId,
      stripeCustomerId,
    });

    revalidatePath("/", "layout");

    return {
      success: true,
      clientSecret: stripeSub.clientSecret,
      subscriptionId: localSub.id as number,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create subscription",
    };
  }
}

/**
 * Create a Stripe Billing Portal session for the current customer.
 * Returns the portal URL to redirect to.
 */
export async function createBillingPortalSession(returnUrl: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const sub = await subscriptionService.getActiveForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    if (!sub?.stripeCustomerId) {
      return { success: false, error: "No active subscription found" };
    }

    const stripeProvider = await getStripeProvider();
    const url = await stripeProvider.createBillingPortalSession(
      sub.stripeCustomerId,
      returnUrl
    );

    return { success: true, url };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create billing session",
    };
  }
}

/**
 * Cancel the current customer's subscription (at period end).
 */
export async function cancelSubscription(): Promise<{
  success: boolean;
  error?: string;
}> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const sub = await subscriptionService.getActiveForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    if (!sub) {
      return { success: false, error: "No active subscription found" };
    }

    // Cancel via Stripe (at period end)
    if (sub.stripeSubscriptionId) {
      const stripeProvider = await getStripeProvider();
      await stripeProvider.cancelSubscription(sub.stripeSubscriptionId, true);
    }

    // Update local record
    await subscriptionService.cancel(sub.id, true);

    revalidatePath("/", "layout");

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to cancel subscription",
    };
  }
}
