"use server";

import { redirect } from "next/navigation";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { setSession, clearSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { createAccountlessContact, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";
// Shared login throttle so the form login and the account-panel login share ONE keyspace.
import { tooManyAttempts, recordFailure } from "@/lib/login-throttle";

// Identity unification: the login subject is a CONTACT. findLoginCandidate
// resolves THE row for (email, channel) — accountless storefront person first,
// then the canonical B2B contact — and never returns inactive contacts.

export async function login(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (tooManyAttempts(email)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const candidate = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as LoginCandidate | null;

  // Neutral on every failure arm — unknown email, no password on file (B2B
  // pre-activation / Google-only), wrong password — so nothing is enumerable.
  const { valid, needsRehash } = await verifyPassword(password, candidate?.password_hash);

  if (!candidate || !valid) {
    recordFailure(email);
    return { error: "Invalid email or password." };
  }

  // Transparently upgrade legacy (scrypt$ / unsalted-SHA-256) hashes to bcrypt
  // on successful login — contactService.update hashes `password` itself.
  if (needsRehash) {
    try {
      await contactService.update(candidate.id, { password });
    } catch {
      /* non-fatal — the login still succeeds */
    }
  }

  await setSession(candidate.id, candidate.email);
  redirect("/account");
}

export async function register(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
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

  // Neutral response — do NOT confirm that an account with this email exists
  // (account enumeration). String-identical whether the email is held by a B2B
  // contact or an accountless shopper; the account-activation email flow is the
  // only path in for a B2B-owned address.
  if (!(await contactService.isEmailAvailableForChannel(email, CHANNEL_ID))) {
    return { error: "We couldn't complete your registration. If you already have an account, please sign in." };
  }

  let contact;
  try {
    contact = await createAccountlessContact({
      email,
      password,
      firstName,
      lastName,
      // Mark self-service registrations as unverified. Checkout refuses to grant
      // B2B net terms (matched only by email string) to a self-registered contact
      // whose email ownership was never verified — otherwise anyone could register
      // with a B2B account's email and buy on invoice. Staff/Zoey-created contacts
      // carry no such marker and keep their terms.
      metafields: { self_registered: true, email_verified: false },
    });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      // Register race — same neutral copy as the availability pre-check.
      return { error: "We couldn't complete your registration. If you already have an account, please sign in." };
    }
    throw e;
  }

  await setSession(contact.id, contact.email);
  redirect("/account");
}

export async function logout() {
  await clearSession();
  redirect("/account");
}
