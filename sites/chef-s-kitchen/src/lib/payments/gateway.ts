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
// Returns the resolved test-mode flag alongside the gateway because callers need
// it too: the publishable-key choice AND the "TEST MODE" checkout banner.
// ============================================================================

import { CHANNEL_ID, storeSettingsService } from "@/lib/store";
import { wantsStripeTestMode } from "@keenan/services";
import { enabledStripeGateways, type StripeGatewayEntry } from "@/lib/payments/stripe-gateways";
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
 * Resolves the channel's active Stripe gateway from the global payment_gateways
 * setting. Applies the test-vs-live mode match + prod-safe fallback via
 * selectGateway (D7). Never throws — returns `{ gateway: null }` if the setting
 * is missing/unconfigured (callers decide whether that is fatal).
 */
export async function resolveStripeGateway(): Promise<ResolvedStripeGateway> {
  // An EPHEMERAL test checkout session (short-lived signed cookie on this one
  // browser — nothing stored anywhere) forces the TEST account for this request
  // only. Otherwise the environment default applies: production is live, always.
  const testSession = await hasTestCheckoutSession();
  const envWantsTestMode = await wantsStripeTestMode(CHANNEL_ID);
  try {
    // `payment_gateways` is a SENSITIVE setting (it holds secret_key), so the
    // default read path masks setting_value to "***REDACTED***". This resolver runs
    // server-side and needs the real gateway array (publishable_key here, and
    // secret_key via getStripeProvider), so read it unredacted. Without this the
    // cast below yields a string, `.filter` throws, and every gateway lookup fails
    // ("Payment is not properly configured").
    const setting = await storeSettingsService.getByKey("payment_gateways", { includeSensitive: true });
    const gateways = (setting.setting_value as StripeGatewayEntry[]) || [];
    // The safety-critical choice itself is pure and exhaustively tested in
    // checkout-stripe-mode.ts: no test session means the live key exactly as
    // today; a test session means the TEST gateway or nothing, never a live
    // fallback.
    return resolveCheckoutStripeMode({
      enabled: enabledStripeGateways(gateways),
      testSession,
      envWantsTestMode,
    });
  } catch {
    return { gateway: null, wantTestMode: testSession || envWantsTestMode, testSession };
  }
}
