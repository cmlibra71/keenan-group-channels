// ============================================================================
// Ephemeral TEST CHECKOUT SESSION — the cookie layer.
//
// Test-ness is a property of ONE browser session. It is never stored, never a
// setting, never a mode the shop can be left in. There used to be a per-channel
// `payments_test_mode` flag in `channel_settings`; it is gone, because a stored
// flag is a state a live shop can be LEFT IN — one careless settings save and the
// storefront silently stops taking money with nothing on screen to say so.
//
// What replaces it: a short-lived signed cookie, mintable only by a caller who
// presents a server-side secret (see app/api/test/checkout-session/route.ts).
// While a browser holds it, and only then:
//   - the checkout mounts Stripe Elements with the TEST publishable key,
//   - the PaymentIntent is created on the TEST secret key,
//   - the checkout says so, unmistakably, on screen.
// When it expires the capability is gone. NOTHING is written anywhere.
//
// The signing key is TEST_CHECKOUT_SECRET itself, so with no secret configured
// the feature does not exist: no token can be minted and no token can verify.
//
// This never fakes a payment. It routes to Stripe's TEST account and lets Stripe
// genuinely authorise; Stripe still decides.
// ============================================================================

import { cookies } from "next/headers";
import { CHANNEL_ID } from "@/lib/channel";
import { signTestSessionToken, verifyTestSessionToken } from "@/lib/checkout/test-session-token";

export const TEST_CHECKOUT_COOKIE = "test_checkout";

/**
 * 30 minutes. Long enough to walk a full checkout (build a cart, fill an address,
 * try a decline card, then a 3DS card, then a success), short enough that a
 * forgotten tab cannot leave anyone testing tomorrow. Minutes, not days, on
 * purpose: this is the ONLY thing standing between a tester and the live keys, so
 * it should expire while they are still in the room. Re-granting is one call.
 */
export const TEST_CHECKOUT_TTL_SECONDS = 30 * 60;

/** The server-side secret. Absent = the capability does not exist here. */
function configuredSecret(): string | undefined {
  const secret = process.env.TEST_CHECKOUT_SECRET;
  return secret && secret.length > 0 ? secret : undefined;
}

/** Whether this deployment can grant test checkout sessions at all. */
export function testCheckoutConfigured(): boolean {
  return configuredSecret() !== undefined;
}

/**
 * Whether THIS request carries a live test checkout session.
 *
 * Fail-closed: no cookie, a forged cookie, an expired cookie, a cookie minted for
 * another channel, or no server secret all read false — i.e. an ordinary LIVE
 * checkout, exactly as today.
 */
export async function hasTestCheckoutSession(): Promise<boolean> {
  const secret = configuredSecret();
  if (!secret) return false;
  const token = (await cookies()).get(TEST_CHECKOUT_COOKIE)?.value;
  return verifyTestSessionToken(token, { secret, channelId: CHANNEL_ID, now: Date.now() });
}

/** Mints the cookie. Only ever called after the secret has been presented. */
export async function startTestCheckoutSession(): Promise<{ expiresAt: number }> {
  const secret = configuredSecret();
  if (!secret) throw new Error("TEST_CHECKOUT_SECRET is not configured.");
  const now = Date.now();
  const token = await signTestSessionToken({
    secret,
    channelId: CHANNEL_ID,
    maxAgeSeconds: TEST_CHECKOUT_TTL_SECONDS,
    now,
  });
  (await cookies()).set(TEST_CHECKOUT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TEST_CHECKOUT_TTL_SECONDS,
  });
  return { expiresAt: now + TEST_CHECKOUT_TTL_SECONDS * 1000 };
}

/** Hands the capability back early. */
export async function endTestCheckoutSession(): Promise<void> {
  (await cookies()).delete(TEST_CHECKOUT_COOKIE);
}
