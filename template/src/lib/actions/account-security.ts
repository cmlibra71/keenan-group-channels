"use server";

import { redirect } from "next/navigation";
import {
  contactService,
  customerAuthTokenService,
  getSiteConfig,
  CHANNEL_ID,
} from "@/lib/store";
import { getSession, setSession } from "@/lib/auth";
import { verifyPassword, validatePasswordStrength } from "@/lib/password";
import { mergeContactMetafields } from "@/lib/contact-auth";
import { siteBaseUrl } from "@/lib/seo";
import {
  sendPasswordResetEmail,
  resolveEmailBranding,
  wantsStripeTestMode,
} from "@keenan/services";
import { enforceLimit, noteLimitFailure } from "@/lib/security/rate-limits";

// Self-service password management. These are pure, channel-agnostic auth
// flows shared byte-identically across template + every site (see
// orchestrator/shared-modules.json) — no per-channel Stripe/design wiring lives here.
//
// There is deliberately NO self-service email change: customers cannot move the
// address on their own account. Staff change it on the contact record in the
// portal on request, which is treated as proven (see the portal's
// updateContactAction).
//
// Identity unification: every flow is keyed by CONTACT id. requestPasswordReset
// resolves its subject with contactService.findLoginCandidate, which also reaches
// B2B contacts — a B2B person with no password yet gets an ACTIVATION token
// (type "account_activation") instead of a reset token; consuming it sets their
// first password AND stamps metafields.email_verified=true (the emailed link
// proves inbox ownership, which is what gates email-matched net terms).
//
// Design invariants:
//   - Enumeration-safe: request* actions ALWAYS return the same neutral success,
//     whether or not an account/email matched.
//   - Tokens are single-use, hashed at rest, 30-min TTL (CustomerAuthTokenService).
//   - Tokens are consumed on explicit submit, never on GET page load, so email
//     link-scanners can't burn them.

type ActionResult = { error?: string; success?: boolean; message?: string };

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

  // Rate limited per IP and per address (lib/security/rate-limit-core.ts), but
  // still answered with the neutral success so the limiter doesn't become an
  // enumeration oracle.
  const limit = await enforceLimit("password_reset_request", {
    identifier: email,
    surface: "forgot password",
  });
  if (!limit.allowed) {
    return { success: true, message: NEUTRAL_RESET_MESSAGE };
  }

  const candidate = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as {
    id: number;
    email: string;
    password_hash: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  if (candidate) {
    try {
      // A contact with no password yet (B2B pre-activation, or Google-only) is
      // ACTIVATING, not resetting — separate token type, and the page shows
      // "Set your password" (via ?welcome=1) instead of reset copy.
      const isActivation = !candidate.password_hash;
      const { token } = await customerAuthTokenService.createToken({
        contactId: candidate.id,
        type: isActivation ? "account_activation" : "password_reset",
      });
      const { branding, siteUrl, testMode } = await emailContext();
      await sendPasswordResetEmail({
        to: candidate.email,
        resetUrl: `${siteUrl}/account/reset-password/${token}${isActivation ? "?welcome=1" : ""}`,
        customerName: displayName(candidate),
        branding,
        testMode,
        // We already know exactly who this is and which storefront asked, so the send lands on
        // the right person's Contact history without the portal having to match by address
        // (card utA2Ebnp) — which is the difference between honouring the one-row-per-site rule
        // and guessing for the ~100 addresses two records share.
        contactId: candidate.id,
        channelId: CHANNEL_ID,
      });
    } catch (e) {
      // Never reveal a send/DB failure to the caller — stay neutral.
      console.error("[requestPasswordReset] failed:", e);
    }
  }

  return { success: true, message: NEUTRAL_RESET_MESSAGE };
}

/**
 * Step 2 of forgotten-password: consume the token and set a new password.
 * Accepts BOTH token types — a reset for a contact with a password, an
 * activation for one without. Activation additionally stamps
 * metafields.email_verified=true: following the emailed link proved the person
 * controls the inbox.
 */
export async function resetPassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const token = (formData.get("token") as string)?.trim();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!token) return { error: "This reset link is invalid or has expired. Please request a new one." };

  // Per-IP only: guessing tokens is the attack, and there is no account to key a
  // second bucket on until a token resolves.
  const limit = await enforceLimit("password_reset_submit", { surface: "reset password" });
  if (!limit.allowed) return { error: limit.message };

  const weak = validatePasswordStrength(password);
  if (weak) {
    return { error: weak };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  // consumeToken filters by type in its atomic UPDATE, so probing the wrong type
  // does NOT burn the token — trying both is safe.
  let isActivation = false;
  let consumed = await customerAuthTokenService.consumeToken(token, "password_reset");
  if (!consumed) {
    consumed = await customerAuthTokenService.consumeToken(token, "account_activation");
    isActivation = !!consumed;
  }
  if (!consumed || consumed.contactId == null) {
    return { error: "This reset link is invalid or has expired. Please request a new one." };
  }

  // contactService.update hashes plaintext `password` to bcrypt itself.
  await contactService.update(consumed.contactId, { password });
  if (isActivation) {
    try {
      await mergeContactMetafields(consumed.contactId, { email_verified: true });
    } catch (e) {
      console.error("[resetPassword] email_verified stamp failed (non-fatal):", e);
    }
  }

  // Log the contact in on THIS device (other devices' cookies persist to expiry —
  // see the stateless-session note in auth.ts).
  const contact = (await contactService.getById(consumed.contactId)) as {
    email: string;
  } | null;
  if (contact) {
    await setSession(consumed.contactId, contact.email);
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

  const limit = await enforceLimit("password_change", {
    identifier: String(session.contactId),
    identifierIsEmail: false,
    surface: "change password",
  });
  if (!limit.allowed) return { error: limit.message };

  const weak = validatePasswordStrength(password);
  if (weak) {
    return { error: weak.replace(/^Password/, "New password") };
  }
  if (password !== confirm) return { error: "New passwords do not match." };

  const contact = (await contactService.getById(session.contactId)) as {
    password_hash: string | null;
  } | null;
  const { valid } = await verifyPassword(current, contact?.password_hash);
  if (!contact || !valid) {
    // Only a WRONG current password is charged to the per-account bucket — the
    // attack this guards is a borrowed session cookie being used to take the
    // login over, not a customer changing their password often.
    await noteLimitFailure("password_change", String(session.contactId));
    return { error: "Your current password is incorrect." };
  }

  await contactService.update(session.contactId, { password });
  await setSession(session.contactId, session.email); // refresh this device's cookie
  return { success: true, message: "Your password has been updated." };
}
