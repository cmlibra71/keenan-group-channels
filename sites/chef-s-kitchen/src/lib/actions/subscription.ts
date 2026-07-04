"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  subscriptionPlanService,
  subscriptionService,
  contactService,
  wantStripeTestMode,
} from "@/lib/store";
import { createAddressForContact } from "@/lib/contact-addresses";
import { getStripeProvider } from "@/lib/stripe";

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

  const lockKey = `${CHANNEL_ID}:${session.contactId}`;
  if (subscriptionLocks.has(lockKey)) {
    return { success: false, error: "A subscription request is already being processed." };
  }
  subscriptionLocks.add(lockKey);

  try {
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan) {
      return { success: false, error: "Plan not found" };
    }

    const contact = await contactService.getById(session.contactId);
    if (!contact) {
      return { success: false, error: "Customer not found" };
    }

    // Check for existing active subscription (contact-keyed — identity unification)
    const existing = await subscriptionService.getActiveForContact(
      session.contactId,
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
    const allSubs = await subscriptionService.listForContact(
      session.contactId,
      CHANNEL_ID
    );
    const pendingSub = allSubs.find((s) => s.status === "pending");
    if (pendingSub) {
      const stripeSubId = pendingSub.stripe_subscription_id as string | null;
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

    // Get or create Stripe customer. Metadata keys are unchanged for existing
    // Stripe-side reporting; since identity unification the numeric subject is
    // the CONTACT id (mirrored under contact_id for clarity).
    const stripeCustomerId = await stripeProvider.getOrCreateCustomer(
      contact.email as string,
      `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || undefined,
      {
        channel_id: String(CHANNEL_ID),
        customer_id: String(session.contactId),
        contact_id: String(session.contactId),
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
          customer_id: String(session.contactId),
          contact_id: String(session.contactId),
          plan_id: String(planId),
        },
      }
    );

    // Create local subscription record — contact_id is the subject (identity
    // unification); customer_id no longer written.
    const localSub = await subscriptionService.create({
      channelId: CHANNEL_ID,
      contactId: session.contactId,
      planId: planId,
      status: "pending",
      stripeSubscriptionId: stripeSub.subscriptionId,
      stripeCustomerId,
      ...((await wantStripeTestMode()) ? { metafields: { test_mode: true } } : {}),
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

// Staff/QA test card: entering this number on the subscribe form creates an
// active membership WITHOUT a Stripe charge. DISABLED by default — there is NO
// built-in card value: the feature is inert unless MEMBERSHIP_TEST_CARD is
// explicitly set, and it is ALWAYS disabled when NODE_ENV=production (so an
// unset/leaked env var can never grant free paid membership in prod). The value
// is compared server-side only (never shipped to the client bundle). Mirrors the
// inert-unless-provisioned pattern in src/app/api/test/login/route.ts.
// Entered value + the configured value both have spaces/dashes stripped before
// comparison, so "4242 4242 4242 4242" and "4242424242424242" both match.

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

  // Inert unless explicitly provisioned, and never active in production.
  if (process.env.NODE_ENV === "production") return { created: false };
  const configured = process.env.MEMBERSHIP_TEST_CARD;
  if (!configured) return { created: false };
  const magic = configured.replace(/[\s-]/g, "");
  const entered = (cardValue || "").replace(/[\s-]/g, "");
  if (!magic || entered !== magic) return { created: false }; // not the test card

  try {
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan) return { created: false, error: "Plan not found" };

    const existing = await subscriptionService.getActiveForContact(session.contactId, CHANNEL_ID);
    if (existing) return { created: false, error: "You already have an active subscription" };

    // Recover any stranded pending subscription (e.g. an abandoned real Stripe
    // attempt that never completed) by activating it, rather than blocking.
    const all = await subscriptionService.listForContact(session.contactId, CHANNEL_ID);
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
      contactId: session.contactId,
      planId,
      status: "pending",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      ...((await wantStripeTestMode()) ? { metafields: { test_mode: true } } : {}),
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
    const subs = await subscriptionService.listForContact(
      session.contactId,
      CHANNEL_ID
    );
    const sub = subs.find((s) => s.status === "active" || s.status === "pending");
    if (!sub) {
      return { success: false, error: "No membership found" };
    }

    const contact = await contactService.getById(session.contactId);
    if (!contact) {
      return { success: false, error: "Customer not found" };
    }

    const firstName = (contact.first_name as string) || "";
    const lastName = (contact.last_name as string) || "";

    // Contacts have no company column (identity unification) — company lives
    // under attributes.company; merge so other attribute keys are preserved.
    const attributes = {
      ...((contact.attributes as Record<string, unknown>) || {}),
      company,
    };
    await contactService.update(session.contactId, { phone, attributes });

    await createAddressForContact(session.contactId, {
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
      isDefaultShipping: false,
    });

    // Best-effort Stripe enrichment — never fail the onboarding on this.
    try {
      if (sub.stripe_customer_id) {
        const stripeProvider = await getStripeProvider();
        await stripeProvider.updateCustomer(sub.stripe_customer_id as string, {
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
    const sub = await subscriptionService.getActiveForContact(
      session.contactId,
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
    const sub = await subscriptionService.getActiveForContact(
      session.contactId,
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
