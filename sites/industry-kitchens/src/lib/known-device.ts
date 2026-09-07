// The "we have seen this browser before" cookie — card upTMAqRc.
//
// Tim asked for the storefront to remember a returning customer "like Amazon".
// What Amazon actually remembers on a known device is the ADDRESS, not the
// password: come back after the session has expired and you are greeted by name
// with the email already filled in, and you type only your password. That is what
// this cookie carries — one email address, written after a successful sign-in and
// wiped on sign-out. It is NOT a credential and NOT a session: it proves nothing,
// authorises nothing, and a browser holding it is still signed out.
//
// The authenticated session is a separate cookie and its life is unchanged: seven
// days from the last sign-in, then the password is asked for again (card 18PbOwaG,
// Steve 2026-08-04/10). Nothing here extends it.
//
// Pure on purpose — no React, no next/headers — so the parsing rule is unit
// testable (known-device.test.ts). The cookie read/write lives in lib/auth.ts,
// beside the session cookie it hangs off.

import { normaliseEmail, looksLikeEmail } from "./checkout/account-prompt";

export const KNOWN_DEVICE_COOKIE = "known_device";

/** One year. Long enough to be "the computer I always use", short enough to lapse. */
export const KNOWN_DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

/** RFC-ish ceiling on an address; anything longer is not one we wrote. */
const MAX_EMAIL_LENGTH = 254;

/**
 * The remembered address, or null.
 *
 * Re-validated on the way OUT rather than trusted because it was validated on
 * the way in: the cookie is client-side state and a hand-edited one must not be
 * able to put arbitrary text on the sign-in panel. Anything that does not still
 * parse as an email address is treated as if the device were unknown.
 */
export function parseRememberedEmail(raw: string | null | undefined): string | null {
  const email = normaliseEmail(raw);
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  return looksLikeEmail(email) ? email : null;
}

/**
 * Which address the sign-in panel should start with.
 *
 * An address the customer just TYPED somewhere else always wins — the register
 * form hands the sign-in form the address it refused (cards yUNl5TPq, LQM9FQYe),
 * and overwriting that with a remembered one would send them back to the account
 * they were trying to get away from. The remembered address only fills a blank.
 */
export function chooseSignInEmail(input: {
  typed?: string | null;
  remembered?: string | null;
}): { email: string | null; fromDevice: boolean } {
  const typed = parseRememberedEmail(input.typed);
  if (typed) return { email: typed, fromDevice: false };
  const remembered = parseRememberedEmail(input.remembered);
  if (remembered) return { email: remembered, fromDevice: true };
  return { email: null, fromDevice: false };
}
