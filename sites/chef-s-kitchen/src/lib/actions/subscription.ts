"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  subscriptionPlanService,
  subscriptionService,
  customerService,
  customerAddressService,
} from "@/lib/store";
import { getStripeProvider } from "@/lib/stripe";

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
    // Pick the price id tagged for the current environment: the test price in
    // dev (stripe_price_id_test), the live price in prod (stripe_price_id).
    // A test price with a live key (or vice versa) hard-fails at Stripe, so
    // there is no cross-mode fallback here (unlike the gateway selector).
    const stripePriceId = process.env.NODE_ENV !== "production"
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
 * Required onboarding step after a member's first payment: capture company,
 * phone and a billing address. Persists to the customer + a default-billing
 * address, and best-effort syncs the details onto the Stripe customer (so
 * invoices / the Billing Portal carry them). Requires an active or pending
 * subscription so it can't be used to write arbitrary data.
 */
export async function completeMembershipProfile(input: {
  company: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
}): Promise<{ success: false; error: string } | void> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const company = input.company?.trim();
  const phone = input.phone?.trim();
  const address1 = input.address1?.trim();
  const city = input.city?.trim();
  const postalCode = input.postalCode?.trim();
  if (!company || !phone || !address1 || !city || !postalCode) {
    return { success: false, error: "Please fill in all required fields." };
  }

  try {
    // Must have a subscription (active or pending) to complete onboarding.
    const subs = await subscriptionService.listForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    const sub = subs.find((s) => s.status === "active" || s.status === "pending");
    if (!sub) {
      return { success: false, error: "No membership found" };
    }

    const customer = await customerService.getById(session.customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const firstName = (customer.first_name as string) || "";
    const lastName = (customer.last_name as string) || "";

    await customerService.update(session.customerId, { company, phone });

    await customerAddressService.createForParent(session.customerId, {
      firstName,
      lastName,
      company,
      phone,
      address1,
      address2: input.address2?.trim() || "",
      city,
      stateOrProvince: input.state?.trim() || "",
      postalCode,
      country: "Australia",
      countryCode: "AU",
      isDefaultBilling: true,
    });

    // Best-effort Stripe enrichment — never fail the onboarding on this.
    try {
      if (sub.stripeCustomerId) {
        const stripeProvider = await getStripeProvider();
        await stripeProvider.updateCustomer(sub.stripeCustomerId as string, {
          name: `${firstName} ${lastName}`.trim() || undefined,
          phone,
          address: {
            line1: address1,
            line2: input.address2?.trim() || undefined,
            city,
            state: input.state?.trim() || undefined,
            postal_code: postalCode,
            country: "AU",
          },
        });
      }
    } catch (e) {
      console.error("[completeMembershipProfile] Stripe customer update failed:", e);
    }

    revalidatePath("/", "layout");
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save details",
    };
  }

  // Navigate server-side after a successful mutation (outside try so the
  // redirect's control-flow signal isn't swallowed by the catch).
  redirect("/membership/welcome");
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
