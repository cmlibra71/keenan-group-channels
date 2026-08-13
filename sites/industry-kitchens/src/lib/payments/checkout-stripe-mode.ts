// ============================================================================
// THE test-vs-live decision for a checkout request, as a pure function.
//
// Impure inputs (does this browser hold an ephemeral test checkout session? what
// does the environment default to? which gateways are enabled?) are gathered by
// gateway.ts; the safety-critical choice itself lives here so it can be tested
// exhaustively with no cookies, no database and no Stripe.
//
// Two rules it exists to enforce, in both directions:
//
//   NO TEST SESSION -> the live key, exactly as today. Nothing stored, no
//   setting, no flag can produce test mode in production.
//
//   TEST SESSION -> the TEST gateway or NOTHING. Never a live fallback: the page
//   has told the tester no money will be taken, and mounting Elements on a live
//   key would make that a lie and take real money.
// ============================================================================

import { selectGateway, selectTestGatewayStrict } from "@keenan/services";
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
  /** Enabled Stripe entries from the payment_gateways setting. */
  enabled: StripeGatewayEntry[];
  /** This browser holds a valid, unexpired test checkout session. */
  testSession: boolean;
  /** Environment default (dev = test, production = live). */
  envWantsTestMode: boolean;
}): CheckoutStripeMode {
  const { enabled, testSession, envWantsTestMode } = input;

  if (testSession) {
    // Strict. A null here is the correct, safe answer: the checkout drops the
    // card option rather than charging a real card.
    return { gateway: selectTestGatewayStrict(enabled), wantTestMode: true, testSession: true };
  }

  return {
    gateway: selectGateway(enabled, envWantsTestMode) ?? null,
    wantTestMode: envWantsTestMode,
    testSession: false,
  };
}
