"use server";

import { redirect } from "next/navigation";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { setSession, endShopperSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/account-redirect";
import { verifyPassword, validatePasswordStrength } from "@/lib/password";
import { createAccountlessContact, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";
// Shared login throttle so the form login and the account-panel login share ONE keyspace.
import { tooManyAttempts, recordFailure } from "@/lib/login-throttle";
import { repriceCartForSession } from "@/lib/actions/cart";

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
  // Whatever is already in the basket is re-priced for this customer, so the
  // sign-in page and the account drawer leave the cart in the same state.
  await repriceCartForSession();
  // Finish the journey the customer started — an emailed order link bounced here
  // by the account guard carries its destination in `next`. Only same-site paths
  // survive safeNextPath, so this can't be pushed off-site.
  redirect(safeNextPath(formData.get("next")) ?? "/account");
}

export async function register(
  _prev: { error?: string; emailTaken?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; emailTaken?: boolean }> {
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password || !firstName || !lastName) {
    return { error: "All fields are required." };
  }

  const weak = validatePasswordStrength(password);
  if (weak) {
    return { error: weak };
  }

  // Neutral response — do NOT confirm that an account with this email exists
  // (account enumeration). String-identical whether the email is held by a B2B
  // contact or an accountless shopper; the account-activation email flow is the
  // only path in for a B2B-owned address.
  // `emailTaken` only marks WHICH refusal this is, so the form can offer the sign-in
  // the copy already tells them to use. The wording is unchanged and still says the
  // same thing whether the address belongs to a B2B contact or an accountless
  // shopper, so nothing new is revealed.
  if (!(await contactService.isEmailAvailableForChannel(email, CHANNEL_ID))) {
    return {
      error: "We couldn't complete your registration. If you already have an account, please sign in.",
      emailTaken: true,
    };
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
      return {
        error: "We couldn't complete your registration. If you already have an account, please sign in.",
        emailTaken: true,
      };
    }
    throw e;
  }

  await setSession(contact.id, contact.email);
  await repriceCartForSession(); // same reason as login
  redirect(safeNextPath(formData.get("next")) ?? "/account");
}

export async function logout() {
  await endShopperSession();
  redirect("/account");
}
