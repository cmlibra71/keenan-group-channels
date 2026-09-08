import { cookies } from "next/headers";
import { CHANNEL_ID } from "./channel";
import { signSessionToken, verifySessionToken, type SessionPayload } from "./token";
import { clearCartUuid } from "./cart";
import { clearQuoteUuid } from "./quote";
import { clearLastOrder } from "./checkout/last-order";
import {
  KNOWN_DEVICE_COOKIE,
  KNOWN_DEVICE_MAX_AGE,
  parseRememberedEmail,
} from "./known-device";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return secret;
}

// signToken/verifyToken keep their external signatures; the HMAC sign/verify,
// expiry and channel-binding are the pure token codec (lib/token.ts). Here we
// just supply this channel's secret, id and the clock.
export async function signToken(payload: SessionPayload): Promise<string> {
  return signSessionToken(payload, {
    secret: getSecret(),
    channelId: CHANNEL_ID,
    maxAgeSeconds: SESSION_MAX_AGE,
    now: Date.now(),
  });
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  return verifySessionToken(token, { secret: getSecret(), channelId: CHANNEL_ID, now: Date.now() });
}

// Session subject is a CONTACT id (identity unification, session v2). Old
// customerId-subject cookies fail verification and read as logged-out.
export async function getSession(): Promise<{ contactId: number; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSession(
  contactId: number,
  email: string,
  options: { rememberDevice?: boolean } = {}
): Promise<void> {
  const cookieStore = await cookies();
  const token = await signToken({ contactId, email });
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Card upTMAqRc — remembering the device is a property of ESTABLISHING a
  // session, not something each sign-in path opts into. Written here so a sign-in
  // route added later (a new social provider, a magic link, an activation flow)
  // cannot forget it: exactly the "sixth path" failure the cart re-pricing rule
  // on this surface warns about. Staff impersonation opts OUT — the customer's
  // address must not be left on a staff member's browser.
  if (options.rememberDevice !== false) {
    await rememberDevice(email);
  }
}

/**
 * Remember, on THIS browser, which address last signed in here.
 *
 * httpOnly so page scripts can never read it back, and deliberately NOT signed:
 * it carries no authority, so tampering with it changes nothing except which
 * address the sign-in panel starts with — and that is re-validated on read
 * (parseRememberedEmail). Never a password, never a token.
 */
export async function rememberDevice(email: string): Promise<void> {
  const remembered = parseRememberedEmail(email);
  if (!remembered) return;
  const cookieStore = await cookies();
  cookieStore.set(KNOWN_DEVICE_COOKIE, remembered, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KNOWN_DEVICE_MAX_AGE,
  });
}

/** The address this browser last signed in with, or null if we do not know it. */
export async function readRememberedEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseRememberedEmail(cookieStore.get(KNOWN_DEVICE_COOKIE)?.value);
}

/** Forget this browser: sign-out, and the "Not you?" control on every sign-in face. */
export async function forgetDevice(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(KNOWN_DEVICE_COOKIE);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// The signed-in shopper is carried by FIVE independent cookies, not one: the
// session, the cart, the quote, the just-placed-order breadcrumb and the
// known-device address. Clearing only `session` left the cart and quote (with
// that customer's prices) attached to the browser, so the next person on a shared
// device inherited the basket, could submit the quote and could reopen the
// confirmation. Every sign-out path must go through here. The cart/quote ROWS are
// untouched in the database — this only detaches them from this browser.
//
// The known-device cookie is cleared here for the same reason (card upTMAqRc):
// signing out has to actually forget the device, or the next person on a shared
// computer is shown the last customer's email address.
export async function endShopperSession(): Promise<void> {
  await clearSession();
  await clearCartUuid();
  await clearQuoteUuid();
  await clearLastOrder();
  await forgetDevice();
}
