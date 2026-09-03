// ============================================================================
// THE test-vs-live AND which-account decision for a checkout request, as a pure
// function.
//
// Impure inputs (does this browser hold an ephemeral test checkout session? what
// does the environment default to? which gateways are enabled, on this channel
// and globally?) are gathered by gateway.ts; the safety-critical choice itself
// lives here so it can be tested exhaustively with no cookies, no database and
// no Stripe.
//
// Three rules it exists to enforce:
//
//   NO TEST SESSION -> the live key, exactly as today. Nothing stored, no
//   setting, no flag can produce test mode in production.
//
//   TEST SESSION -> the TEST gateway or NOTHING. Never a live fallback: the page
//   has told the tester no money will be taken, and mounting Elements on a live
//   key would make that a lie and take real money.
//
//   THIS CHANNEL'S OWN ACCOUNT FIRST (card OHDx84DK). A storefront holding its
//   own payment_gateways entries is charged on its own Stripe account, and in
//   LIVE mode it never falls back to another storefront's — that fallback is the
//   bug this card exists to kill: every Chefs Depot payment settled into the
//   Industry Kitchens B2C account while the intent said channel_id 2.
// ============================================================================

import { selectTestGatewayStrict, selectChannelGateway } from "@keenan/services";
import type { StripeGatewayEntry } from "./stripe-gateways";

export type CheckoutStripeMode = {
  /** The gateway to use, or null — null means REFUSE to take card payment. */
  gateway: StripeGatewayEntry | null;
  /** Whether Stripe runs in TEST mode for this request. */
  wantTestMode: boolean;
  /** Whether an ephemeral test checkout session is what put us there. */
  testSession: boolean;
};

export function resolveCheckoutStripeMode(input: {
  /** Enabled Stripe entries from THIS CHANNEL's payment_gateways override. Empty = no override. */
  channelEnabled: StripeGatewayEntry[];
  /** Enabled Stripe entries from the global payment_gateways setting. */
  globalEnabled: StripeGatewayEntry[];
  /** This browser holds a valid, unexpired test checkout session. */
  testSession: boolean;
  /** Environment default (dev = test, production = live). */
  envWantsTestMode: boolean;
}): CheckoutStripeMode {
  const { channelEnabled, globalEnabled, testSession, envWantsTestMode } = input;

  if (testSession) {
    // Strict, and this channel's own test account first. A null here is the
    // correct, safe answer: the checkout drops the card option rather than
    // charging a real card.
    return {
      gateway: selectTestGatewayStrict(channelEnabled) ?? selectTestGatewayStrict(globalEnabled),
      wantTestMode: true,
      testSession: true,
    };
  }

  return {
    gateway: selectChannelGateway(channelEnabled, globalEnabled, envWantsTestMode) ?? null,
    wantTestMode: envWantsTestMode,
    testSession: false,
  };
}
