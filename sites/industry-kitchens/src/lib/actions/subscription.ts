"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  subscriptionPlanService,
  subscriptionService,
  customerService,
} from "@/lib/store";
import { StripeSubscriptionProvider, wantsStripeTestMode } from "@keenan/services";
import { resolveStripeGateway } from "@/lib/payments/gateway";

async function getStripeProvider(): Promise<StripeSubscriptionProvider> {
  const { gateway } = await resolveStripeGateway();
  if (!gateway?.credentials?.secret_key) {
    throw new Error("Stripe is not configured. Set up the global Stripe gateway in the portal under Settings > Payments.");
  }
  return new StripeSubscriptionProvider(gateway.credentials.secret_key);
}

// Per-customer in-flight guard (per container): the active/pending check and the
// Stripe+local create aren't atomic, so two concurrent submits (double-click / retry)
// could both create a Stripe subscription → double billing. This serializes them on a
// single node; the second concurrent call bails instead of creating a second sub.
const subscriptionLocks = new Set<string>();

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

  const lockKey = `${CHANNEL_ID}:${session.customerId}`;
  if (subscriptionLocks.has(lockKey)) {
    return { success: false, error: "A subscription request is already being processed." };
  }
  subscriptionLocks.add(lockKey);

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
    // Pick the price id tagged for the current environment: the test price in
    // dev (stripe_price_id_test), the live price in prod (stripe_price_id).
    // A test price with a live key (or vice versa) hard-fails at Stripe, so
    // there is no cross-mode fallback here (unlike the gateway selector).
    const stripePriceId = (await wantsStripeTestMode(CHANNEL_ID))
      ? metafields?.stripe_price_id_test
      : metafields?.stripe_price_id;
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
      ...((await wantsStripeTestMode(CHANNEL_ID)) ? { metafields: { test_mode: true } } : {}),
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
  } finally {
    subscriptionLocks.delete(lockKey);
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
    if (!sub?.stripe_customer_id) {
      return { success: false, error: "No active subscription found" };
    }

    const stripeProvider = await getStripeProvider();
    const url = await stripeProvider.createBillingPortalSession(
      sub.stripe_customer_id,
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
    if (sub.stripe_subscription_id) {
      const stripeProvider = await getStripeProvider();
      await stripeProvider.cancelSubscription(sub.stripe_subscription_id, true);
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
