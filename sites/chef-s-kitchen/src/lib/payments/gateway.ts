// ============================================================================
// Storefront Stripe gateway resolution — one home for "which Stripe gateway,
// in which mode, for this channel".
//
// Previously the same wiring (resolve test-vs-live mode -> read the global
// payment_gateways setting -> keep only enabled Stripe entries -> selectGateway)
// was hand-rolled in both the membership action (getStripeProvider) and the
// checkout page (publishable-key lookup). The mode-match + prod-safe fallback
// itself lives in @keenan/services `selectGateway` (services CONTEXT.md D7) and
// is tested there; the enabled-Stripe filter is pure and tested in
// stripe-gateways.ts. This module is the thin impure adapter that fetches the
// setting and combines the two.
//
// PER CHANNEL since card OHDx84DK. Until then this read only the GLOBAL
// `store_settings.payment_gateways` row, which has no channel column — so every
// Chefs Depot checkout charged the Industry Kitchens B2C account even though the
// intent it created was stamped `channel_id: 2`. A channel may now hold its OWN
// entries in `channel_settings.payment_gateways`; a channel with no override
// keeps reading the global row exactly as before, so Industry Kitchens is
// untouched. The choice itself stays pure, in checkout-stripe-mode.ts.
//
// Returns the resolved test-mode flag alongside the gateway because callers need
// it too: the publishable-key choice AND the "TEST MODE" checkout banner.
// ============================================================================

import { CHANNEL_ID } from "@/lib/store";
import {
  wantsStripeTestMode,
  readChannelGatewayLists,
  enabledGatewaysOfProvider,
} from "@keenan/services";
import { type StripeGatewayEntry } from "@/lib/payments/stripe-gateways";
import { hasTestCheckoutSession } from "@/lib/checkout/test-session";
import { resolveCheckoutStripeMode } from "@/lib/payments/checkout-stripe-mode";

export type { StripeGatewayEntry } from "@/lib/payments/stripe-gateways";

export type ResolvedStripeGateway = {
  gateway: StripeGatewayEntry | null;
  /** Whether Stripe should run in TEST mode for this request right now. */
  wantTestMode: boolean;
  /**
   * True only when THIS browser holds a live ephemeral test checkout session.
   * The on-screen "test mode, no money will be taken" banner is rendered from
   * this and nothing else, so it cannot appear without one.
   */
  testSession: boolean;
};

/**
 * Resolves this channel's active Stripe gateway — its OWN payment_gateways
 * entries first, the global ones when it has none. Applies the test-vs-live mode
 * match + prod-safe fallback via selectChannelGateway (D7 + card OHDx84DK).
 * Never throws — returns `{ gateway: null }` if nothing usable is configured
 * (callers decide whether that is fatal; everywhere money moves, it is).
 */
export async function resolveStripeGateway(): Promise<ResolvedStripeGateway> {
  // An EPHEMERAL test checkout session (short-lived signed cookie on this one
  // browser — nothing stored anywhere) forces the TEST account for this request
  // only. Otherwise the environment default applies: production is live, always.
  const testSession = await hasTestCheckoutSession();
  const envWantsTestMode = await wantsStripeTestMode(CHANNEL_ID);
  try {
    // The global `payment_gateways` row is SENSITIVE (it holds secret_key), so
    // the services reader takes it with getSecret — the default read path masks
    // setting_value to "***REDACTED***", which used to make `.filter` throw and
    // every gateway lookup fail ("Payment is not properly configured").
    const lists = await readChannelGatewayLists(CHANNEL_ID);
    // The safety-critical choice itself is pure and exhaustively tested in
    // checkout-stripe-mode.ts: no test session means the live key exactly as
    // today; a test session means the TEST gateway or nothing, never a live
    // fallback; and this channel's own account always beats the global one.
    return resolveCheckoutStripeMode({
      channelEnabled: enabledGatewaysOfProvider(lists.channel, "stripe") as StripeGatewayEntry[],
      globalEnabled: enabledGatewaysOfProvider(lists.global, "stripe") as StripeGatewayEntry[],
      testSession,
      envWantsTestMode,
    });
  } catch {
    return { gateway: null, wantTestMode: testSession || envWantsTestMode, testSession };
  }
}
