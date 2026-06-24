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
  wantStripeTestMode,
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

    const stripeProvider = await getStripeProvider();

    // Recover any stranded "pending" record before creating a new one. A pending
    // row is written before the customer confirms payment, so an abandoned or
    // declined checkout leaves one behind. Rather than hard-blocking every
    // future attempt ("You have a pending subscription being processed"), we
    // reconcile it against Stripe:
    //   - still awaiting first payment → reuse it (return its client secret so
    //     the customer can retry payment on the same subscription)
    //   - already paid (active/trialing) → activate locally and let them through
    //   - dead/expired/gone → discard it and fall through to create a fresh one
    const allSubs = await subscriptionService.listForCustomer(
      session.customerId,
      CHANNEL_ID
    );
    const pendingSub = allSubs.find((s) => s.status === "pending");
    if (pendingSub) {
      const stripeSubId = pendingSub.stripeSubscriptionId as string | null;
      const remote = stripeSubId
        ? await stripeProvider.getSubscription(stripeSubId).catch(() => null)
        : null;

      if (remote && (remote.status === "active" || remote.status === "trialing")) {
        // Payment already succeeded (a missed/late webhook) — reconcile locally.
        await subscriptionService.activate(pendingSub.id as number);
        revalidatePath("/", "layout");
        return {
          success: true,
          clientSecret: null,
          subscriptionId: pendingSub.id as number,
        };
      }

      if (
        remote &&
        (remote.status === "incomplete" || remote.status === "past_due") &&
        remote.clientSecret
      ) {
        // Still awaiting its first payment — let the customer retry on the same
        // subscription instead of stranding them.
        return {
          success: true,
          clientSecret: remote.clientSecret,
          subscriptionId: pendingSub.id as number,
        };
      }

      // No usable Stripe subscription (never finalised, expired, cancelled, or a
      // bypass-created pending with no Stripe id): discard and recreate.
      await subscriptionService.delete(pendingSub.id as number).catch(() => {});
    }

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
    // Pick the price id matching the Stripe mode: the test price in dev OR when
    // the channel's "Payments test mode" toggle is on (stripe_price_id_test), the
    // live price otherwise (stripe_price_id). Must match the gateway the provider
    // selected — a test price with a live key (or vice versa) hard-fails at Stripe,
    // so there is no cross-mode fallback here.
    const stripePriceId = (await wantStripeTestMode())
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

// Staff/QA test card: entering this number on the subscribe form creates an
// active membership WITHOUT a Stripe charge. The value is compared server-side
// only (never shipped to the client bundle); override or rotate via the
// MEMBERSHIP_TEST_CARD env var, or change this constant. Remove before relying
// on real paid signups in production.
// Entered value + this value both have spaces/dashes stripped before comparison,
// so "4242 4242 4242 4242" and "4242424242424242" both work.
const TEST_CARD_DEFAULT = "4242424242424242";

/**
 * If `cardValue` matches the configured test card, create + activate a
 * membership locally with no Stripe charge and return { created: true }.
 * Otherwise returns { created: false } so the caller falls back to real payment.
 */
export async function attemptTestMembership(
  planId: number,
  cardValue: string
): Promise<{ created: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { created: false, error: "Not authenticated" };

  const magic = (process.env.MEMBERSHIP_TEST_CARD ?? TEST_CARD_DEFAULT).replace(/[\s-]/g, "");
  const entered = (cardValue || "").replace(/[\s-]/g, "");
  if (!magic || entered !== magic) return { created: false }; // not the test card

  try {
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan) return { created: false, error: "Plan not found" };

    const existing = await subscriptionService.getActiveForCustomer(session.customerId, CHANNEL_ID);
    if (existing) return { created: false, error: "You already have an active subscription" };

    // Recover any stranded pending subscription (e.g. an abandoned real Stripe
    // attempt that never completed) by activating it, rather than blocking.
    const all = await subscriptionService.listForCustomer(session.customerId, CHANNEL_ID);
    const pending = all.find((s) => s.status === "pending");
    if (pending) {
      await subscriptionService.activate(pending.id as number);
      revalidatePath("/", "layout");
      return { created: true };
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const localSub = await subscriptionService.create({
      channelId: CHANNEL_ID,
      customerId: session.customerId,
      planId,
      status: "pending",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
    await subscriptionService.activate(localSub.id as number);

    revalidatePath("/", "layout");
    return { created: true };
  } catch (err) {
    return { created: false, error: err instanceof Error ? err.message : "Failed to create membership" };
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
