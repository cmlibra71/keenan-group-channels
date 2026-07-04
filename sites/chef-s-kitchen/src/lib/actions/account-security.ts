"use server";

import { redirect } from "next/navigation";
import {
  customerService,
  customerAuthTokenService,
  getSiteConfig,
  CHANNEL_ID,
} from "@/lib/store";
import { getSession, setSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { siteBaseUrl } from "@/lib/seo";
import {
  sendPasswordResetEmail,
  sendEmailChangeVerificationEmail,
  resolveEmailBranding,
  wantsStripeTestMode,
} from "@keenan/services";

// Self-service password + email management. These are pure, channel-agnostic auth
// flows shared byte-identically across template + every site (see
// orchestrator/shared-modules.json) — no per-channel Stripe/design wiring lives here.
//
// Design invariants:
//   - Enumeration-safe: request* actions ALWAYS return the same neutral success,
//     whether or not an account/email matched.
//   - Tokens are single-use, hashed at rest, 30-min TTL (CustomerAuthTokenService).
//   - Tokens are consumed on explicit submit, never on GET page load, so email
//     link-scanners can't burn them.

const MIN_PASSWORD_LENGTH = 8;

type ActionResult = { error?: string; success?: boolean; message?: string };

// Basic in-memory throttle (per container), mirroring lib/actions/auth.ts. Keyed
// per (flow:identifier) so password-reset and email-change requests are bounded
// independently. Not a cross-replica store, but it blunts abuse of a single node.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear(); // crude bound
  return recent.length > MAX_ATTEMPTS;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Assemble this channel's email branding + link base + test-mode flag. */
async function emailContext() {
  const { site, channel } = await getSiteConfig();
  const siteUrl = siteBaseUrl(site?.url);
  // Central template: sites row + Email Templates overrides (channel_settings
  // `email_template`), resolved by @keenan/services so every sender matches.
  const resolved = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
  const branding = resolved ?? {
    storeName: site?.siteName || channel?.name || "Keenan Group",
    logoUrl: site?.logoUrl ?? null,
    logoAlt: site?.logoAlt ?? null,
    siteUrl,
    fromEmail: site?.fromEmail ?? null,
  };
  const testMode = await wantsStripeTestMode(CHANNEL_ID);
  return { branding, siteUrl, testMode };
}

function displayName(c: { first_name?: string | null; last_name?: string | null }): string | undefined {
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return name || undefined;
}

const NEUTRAL_RESET_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. Check your inbox.";

/** Step 1 of forgotten-password: email a one-time reset link. Enumeration-safe. */
export async function requestPasswordReset(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Throttled, but still return the neutral success so throttling doesn't leak
  // whether an account exists.
  if (tooManyAttempts(`reset:${email}`)) {
    return { success: true, message: NEUTRAL_RESET_MESSAGE };
  }

  const customer = await customerService.findByEmailAndChannel(email, CHANNEL_ID);
  if (customer) {
    try {
      const { token } = await customerAuthTokenService.createToken({
        customerId: customer.id,
        type: "password_reset",
      });
      const { branding, siteUrl, testMode } = await emailContext();
      await sendPasswordResetEmail({
        to: customer.email,
        resetUrl: `${siteUrl}/account/reset-password/${token}`,
        customerName: displayName(customer),
        branding,
        testMode,
      });
    } catch (e) {
      // Never reveal a send/DB failure to the caller — stay neutral.
      console.error("[requestPasswordReset] failed:", e);
    }
  }

  return { success: true, message: NEUTRAL_RESET_MESSAGE };
}

/** Step 2 of forgotten-password: consume the token and set a new password. */
export async function resetPassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const token = (formData.get("token") as string)?.trim();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!token) return { error: "This reset link is invalid or has expired. Please request a new one." };
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const consumed = await customerAuthTokenService.consumeToken(token, "password_reset");
  if (!consumed || consumed.customerId == null) {
    return { error: "This reset link is invalid or has expired. Please request a new one." };
  }

  const passwordHash = await hashPassword(password);
  await customerService.update(consumed.customerId, { passwordHash });

  // Log the customer in on THIS device (other devices' cookies persist to expiry —
  // see the stateless-session note in auth.ts).
  const customer = await customerService.getById(consumed.customerId) as {
    email: string;
  } | null;
  if (customer) {
    await setSession(consumed.customerId, customer.email);
  }
  redirect("/account");
}

/** Change password while logged in — re-verifies the current password first. */
export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in to change your password." };

  const current = formData.get("currentPassword") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!current) return { error: "Please enter your current password." };
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "New passwords do not match." };

  const customer = await customerService.getById(session.customerId) as {
    password_hash: string | null;
  } | null;
  const { valid } = await verifyPassword(current, customer?.password_hash);
  if (!customer || !valid) {
    return { error: "Your current password is incorrect." };
  }

  await customerService.update(session.customerId, { passwordHash: await hashPassword(password) });
  await setSession(session.customerId, session.email); // refresh this device's cookie
  return { success: true, message: "Your password has been updated." };
}

const NEUTRAL_EMAIL_CHANGE_MESSAGE =
  "Check your new inbox — if that address is available we've sent a link to confirm the change.";

/** Step 1 of email change: verify identity, email a confirmation link to the NEW address. */
export async function requestEmailChange(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in to change your email." };

  const newEmail = (formData.get("newEmail") as string)?.trim().toLowerCase();
  const current = formData.get("currentPassword") as string;

  if (!newEmail || !isValidEmail(newEmail)) {
    return { error: "Please enter a valid email address." };
  }
  if (newEmail === session.email.toLowerCase()) {
    return { error: "That's already the email on your account." };
  }
  if (!current) return { error: "Please enter your current password to confirm." };

  // Re-verify the password so a stolen session cookie can't silently move the
  // account's email (which would let an attacker take over the login).
  const customer = await customerService.getById(session.customerId) as {
    password_hash: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  const { valid } = await verifyPassword(current, customer?.password_hash);
  if (!customer || !valid) {
    return { error: "Your password is incorrect." };
  }

  if (tooManyAttempts(`email-change:${session.customerId}`)) {
    return { success: true, message: NEUTRAL_EMAIL_CHANGE_MESSAGE };
  }

  // Enumeration-safe: only mint + send when the address is actually free, but
  // always return the same message. A real collision is also re-checked at confirm.
  if (await customerService.isEmailAvailableForChannel(newEmail, CHANNEL_ID)) {
    try {
      const { token } = await customerAuthTokenService.createToken({
        customerId: session.customerId,
        type: "email_change",
        payload: { newEmail },
      });
      const { branding, siteUrl, testMode } = await emailContext();
      await sendEmailChangeVerificationEmail({
        to: newEmail,
        verifyUrl: `${siteUrl}/account/verify-email/${token}`,
        customerName: displayName(customer),
        branding,
        testMode,
      });
    } catch (e) {
      console.error("[requestEmailChange] failed:", e);
    }
  }

  return { success: true, message: NEUTRAL_EMAIL_CHANGE_MESSAGE };
}

/**
 * Step 2 of email change: consume the token and apply the new email. Invoked on an
 * explicit click from the verify-email page (not on GET), so link scanners can't
 * burn the token. Re-issues the session cookie since it embeds the email.
 */
export async function confirmEmailChange(token: string): Promise<ActionResult> {
  const consumed = await customerAuthTokenService.consumeToken(token?.trim(), "email_change");
  if (!consumed || consumed.customerId == null) {
    return { error: "This confirmation link is invalid or has expired." };
  }

  const newEmail = (consumed.payload?.newEmail as string | undefined)?.trim().toLowerCase();
  if (!newEmail || !isValidEmail(newEmail)) {
    return { error: "This confirmation link is invalid or has expired." };
  }

  // Guard the race between request and confirm — the address may have been taken
  // by another registration in the interim.
  if (!(await customerService.isEmailAvailableForChannel(newEmail, CHANNEL_ID))) {
    return { error: "That email address is no longer available." };
  }

  const customer = await customerService.getById(consumed.customerId) as {
    metafields?: Record<string, unknown> | null;
  } | null;
  if (!customer) {
    return { error: "This confirmation link is invalid or has expired." };
  }

  const metafields = { ...((customer.metafields as Record<string, unknown>) || {}), email_verified: true };
  await customerService.update(consumed.customerId, { email: newEmail, metafields });

  // The session HMAC embeds the email — re-issue so the current device stays valid.
  await setSession(consumed.customerId, newEmail);
  return { success: true, message: "Your email address has been updated.", };
}
