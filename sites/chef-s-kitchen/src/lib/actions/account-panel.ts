"use server";

import { refresh } from "next/cache";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { getSession, setSession, endShopperSession, readRememberedEmail } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { createAccountlessContact, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";
import { claimGuestCheckoutContact } from "@/lib/checkout/guest-contact";
import { isUnclaimedGuestRecord } from "@/lib/checkout/guest-contact-policy";
import { hashPasswordForStorage } from "@keenan/services";
import { enforceLimit, noteLimitFailure } from "@/lib/security/rate-limits";
import { normaliseEmail, looksLikeEmail } from "@/lib/checkout/account-prompt";
import { repriceCartForSession } from "@/lib/actions/cart";

type PanelSession = { contactId: number; email: string; firstName: string; lastName: string };

export async function getSessionInfo() {
  const session = await getSession();
  if (!session) return null;

  // getById goes through transformRow → snake_case keys.
  const contact = (await contactService.getById(session.contactId)) as {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;

  if (!contact) return null;

  return {
    contactId: session.contactId,
    email: contact.email,
    firstName: contact.first_name ?? "",
    lastName: contact.last_name ?? "",
  };
}

/**
 * The address this browser last signed in with, for the drawer's sign-in face.
 *
 * Card upTMAqRc. The drawer is a client component and the cookie is httpOnly, so
 * the remembered address has to come back over a server action like the session
 * does. Answers null for a signed-in shopper — they are not looking at a sign-in
 * form — and never throws: a missing hint must not break the drawer.
 */
export async function getRememberedEmail(): Promise<string | null> {
  try {
    if (await getSession()) return null;
    return await readRememberedEmail();
  } catch {
    return null;
  }
}

export async function loginFromPanel(formData: FormData): Promise<{
  error?: string;
  session?: PanelSession;
}> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Same policy + keyspace as the sign-in form action, so this alternate login
  // path can't be used to bypass the brute-force limit.
  const limit = await enforceLimit("sign_in", { identifier: email, surface: "account drawer" });
  if (!limit.allowed) {
    return { error: limit.message };
  }

  const candidate = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as LoginCandidate | null;

  const { valid, needsRehash } = await verifyPassword(password, candidate?.password_hash);
  if (!candidate || !valid) {
    await noteLimitFailure("sign_in", email);
    return { error: "Invalid email or password." };
  }
  if (needsRehash) {
    try {
      // contactService.update hashes plaintext `password` to bcrypt itself.
      await contactService.update(candidate.id, { password });
    } catch {
      /* non-fatal */
    }
  }

  await setSession(candidate.id, candidate.email);
  // Signing in from the cart/checkout drawer must put this customer's own prices
  // on the basket they are looking at — the panel is opened mid-checkout.
  await repriceCartForSession();
  refresh(); // acting user's view refreshes; shared data cache stays intact

  return {
    session: {
      contactId: candidate.id,
      email: candidate.email,
      firstName: candidate.first_name ?? "",
      lastName: candidate.last_name ?? "",
    },
  };
}

/**
 * Create an account from the drawer.
 *
 * `emailTaken` is the caller's cue to SEND THEM TO SIGN IN rather than leave them
 * staring at a refusal — the complaint behind cards yUNl5TPq / LQM9FQYe. It says
 * nothing the error copy on this path did not already say, so it leaks nothing
 * new; the neutral wording on the full-page register action is unchanged.
 */
export async function registerFromPanel(formData: FormData): Promise<{
  error?: string;
  emailTaken?: boolean;
  session?: PanelSession;
}> {
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password || !firstName || !lastName) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const limit = await enforceLimit("registration", {
    identifier: email,
    surface: "account drawer register",
  });
  if (!limit.allowed) {
    return { error: limit.message };
  }

  // Same copy for B2B-owned and accountless-taken emails (enumeration safety).
  if (!(await contactService.isEmailAvailableForChannel(email, CHANNEL_ID))) {
    // Except a record a guest checkout left behind, which is not an account and
    // has no password to sign in with — the shopper claims their own row instead
    // of being sent to a sign-in that cannot succeed. See lib/actions/auth.ts for
    // the same branch on the register PAGE, and guest-contact.ts for what the
    // claim refuses.
    const claimed = await claimGuestCheckoutContact({
      email,
      passwordHash: await hashPasswordForStorage(password),
      firstName,
      lastName,
      metafields: { self_registered: true, email_verified: false },
    });
    if (claimed) {
      await setSession(claimed.id, claimed.email);
      await repriceCartForSession(); // same reason as a fresh registration
      refresh(); // acting user's view refreshes; shared data cache stays intact
      return {
        session: {
          contactId: claimed.id,
          email: claimed.email,
          firstName: claimed.first_name ?? "",
          lastName: claimed.last_name ?? "",
        },
      };
    }
    return { error: "An account with this email already exists.", emailTaken: true };
  }

  let contact;
  try {
    contact = await createAccountlessContact({
      email,
      password,
      firstName,
      lastName,
      // Same unverified marker as the form register — see lib/actions/auth.ts.
      metafields: { self_registered: true, email_verified: false },
    });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return { error: "An account with this email already exists.", emailTaken: true };
    }
    throw e;
  }

  await setSession(contact.id, contact.email);
  await repriceCartForSession(); // same reason as loginFromPanel
  refresh(); // acting user's view refreshes; shared data cache stays intact

  return {
    session: {
      contactId: contact.id,
      email: contact.email,
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
    },
  };
}

/**
 * Does this email already have an account on this storefront?
 *
 * Powers the checkout hint: a returning customer who types their address into
 * the guest checkout is told they have an account and offered the sign-in
 * drawer, instead of silently placing a guest order at guest prices. True means
 * "there is a sign-in you can complete" — the answer comes from the SAME
 * findLoginCandidate lookup the login action uses (active contact on this
 * channel, or an active B2B contact anywhere), and a contact that has no
 * password yet can still get in via Forgot password, which issues them an
 * activation link.
 *
 * Exposure: the register form already replies "An account with this email
 * already exists", so this reveals nothing new about a single address. What it
 * would otherwise add is BULK enumeration, so probes are rate-limited per IP
 * (the shared rulebook's `email_lookup` policy) and answer a flat false once the
 * budget is spent.
 */
export async function emailHasAccount(email: string): Promise<boolean> {
  try {
    const normalised = normaliseEmail(email);
    if (!looksLikeEmail(normalised)) return false;

    // A signed-in shopper editing the order email has nothing to be prompted about.
    if (await getSession()) return false;

    // Every probe counts against the budget, hit or miss.
    const limit = await enforceLimit("email_lookup", { surface: "checkout email probe" });
    if (!limit.allowed) return false;

    const candidate = (await contactService.findLoginCandidate(normalised, CHANNEL_ID)) as
      | { password_hash?: string | null; metafields?: Record<string, unknown> | null }
      | null;
    // A record a guest checkout left behind is NOT an account (card LiuLvc5b): it
    // holds no password, so "you already have an account — sign in" would be both
    // wrong and a dead end for a repeat guest. Everything else a passwordless
    // candidate can be — a B2B contact awaiting activation, a Google-only shopper
    // — still answers true, because Forgot password does let them in.
    if (isUnclaimedGuestRecord(candidate)) return false;
    return !!candidate;
  } catch (e) {
    // A hint is never worth breaking checkout for.
    console.error("[emailHasAccount] failed (non-fatal):", e);
    return false;
  }
}

export async function logoutFromPanel() {
  await endShopperSession();
  refresh(); // acting user's view refreshes; shared data cache stays intact
}
