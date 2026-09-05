import {
  StripeSubscriptionProvider,
  resolveScopedChannelStripeGateway,
  resolveStripeGatewayForScope,
  wantsStripeTestMode,
} from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

/**
 * WHICH STRIPE ACCOUNT DOES MEMBERSHIP TALK TO? (card OHDx84DK)
 *
 * Since that card a storefront may hold its OWN Stripe account
 * (`channel_settings.payment_gateways`), and one with no override reads the
 * global row exactly as before. For a PAYMENT that is the whole story: an order
 * is charged once and carries its channel.
 *
 * Membership is different. A plan's product and price, a member's Stripe
 * customer and their subscription all live inside ONE account, are invisible to
 * every other one, and OUTLIVE the configuration that made them. Every Chefs
 * Depot subscription running today — and the plan itself — was minted while
 * there was one shared account. Resolving those by today's channel rule would
 * point CD's key at objects CD's account has never heard of: "No such
 * subscription", "No such customer", "No such price".
 *
 * So: mint with `stripeProviderForNew`, and record the marker it returns beside
 * whatever you created. Touch something that already exists with
 * `stripeProviderForScope`, passing the marker that record carries — no marker
 * means the shared account, which is where everything older lives.
 */
export interface ScopedSubscriptionProvider {
  provider: StripeSubscriptionProvider;
  /** Store this beside whatever you are about to mint (`metafields.stripe_account_scope`). */
  scope: string;
}

const NOT_CONFIGURED =
  "Stripe is not configured. Set up this storefront's Stripe gateway in the portal under Settings > Payments.";

/** For MINTING a Stripe object: this storefront's account, plus the marker to store. */
export async function stripeProviderForNew(): Promise<ScopedSubscriptionProvider> {
  const wantTestMode = await wantsStripeTestMode(CHANNEL_ID);
  const resolved = await resolveScopedChannelStripeGateway({
    channelId: CHANNEL_ID,
    wantTestMode,
  });
  const secretKey = resolved?.gateway?.credentials?.secret_key?.trim();
  if (!resolved || !secretKey) throw new Error(NOT_CONFIGURED);
  return { provider: new StripeSubscriptionProvider(secretKey), scope: resolved.scope };
}

/** For a Stripe object that ALREADY EXISTS: the account its marker names. */
export async function stripeProviderForScope(
  scope: string | null | undefined
): Promise<StripeSubscriptionProvider> {
  const wantTestMode = await wantsStripeTestMode(CHANNEL_ID);
  const gateway = await resolveStripeGatewayForScope({ scope, wantTestMode });
  const secretKey = gateway?.credentials?.secret_key?.trim();
  if (!secretKey) throw new Error(NOT_CONFIGURED);
  return new StripeSubscriptionProvider(secretKey);
}

/**
 * The PUBLISHABLE key of the account a record's marker names — what Stripe.js
 * must be mounted with, plus the mode the same resolution ran in.
 *
 * ELEMENTS AND THE INTENT MUST ADDRESS ONE ACCOUNT. The subscribe page took its
 * publishable key from `resolveStripeGateway()` — today's CHANNEL rule — while
 * `createSubscription` created the subscription on the PLAN's account. Those are
 * the same account only until a storefront gets its own: between the day Chefs
 * Depot's keys are entered and the day the plan is re-minted, the page would
 * mount CD's `pk_live_` and then confirm a client secret belonging to an intent
 * in the Industry Kitchens account — `resource_missing`, on every attempt,
 * including the pending-subscription retry. That is precisely the hazard the
 * checkout merged its two readers to avoid, and the runbook, the plan warning
 * and the `membership-overview` register rule all promise new sign-ups keep
 * working through the cutover.
 *
 * Mode is `wantsStripeTestMode(CHANNEL_ID)`, the SAME environment answer
 * `stripeProviderForScope` and the plan's price-id pick use — never the
 * checkout's ephemeral test-session cookie, which has nothing to do with a
 * subscription and would mount a test key against a live subscription.
 */
export async function stripePublishableKeyForScope(
  scope: string | null | undefined
): Promise<{ publishableKey: string | null; testMode: boolean }> {
  const testMode = await wantsStripeTestMode(CHANNEL_ID);
  const gateway = await resolveStripeGatewayForScope({ scope, wantTestMode: testMode });
  const publishableKey = gateway?.credentials?.publishable_key?.trim();
  return { publishableKey: publishableKey || null, testMode };
}

/** The marker a stored record carries. `null` when it predates the marker. */
export function stripeScopeOf(record: { metafields?: unknown } | null | undefined): string | null {
  const metafields = record?.metafields as Record<string, unknown> | null | undefined;
  const value = metafields?.stripe_account_scope;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
