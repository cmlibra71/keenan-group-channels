"use server";

import { refresh } from "next/cache";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { getSession, setSession, endShopperSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { createAccountlessContact, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";
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

    const candidate = await contactService.findLoginCandidate(normalised, CHANNEL_ID);
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
