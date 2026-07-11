"use server";

import { refresh } from "next/cache";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { setSession } from "@/lib/auth";
import { verifyGoogleClaims, type GoogleTokenInfo } from "@/lib/google-claims";
import { createAccountlessContact, mergeContactMetafields, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";

type GoogleSignInResult = {
  error?: string;
  session?: {
    contactId: number;
    email: string;
    firstName: string;
    lastName: string;
  };
};

export async function googleSignIn(credential: string): Promise<GoogleSignInResult> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return { error: "Google sign-in is not configured." };
  }

  // Verify the ID token with Google (network I/O stays here; the trust decision
  // — audience match + verified email + identity normalization — is the pure
  // verifyGoogleClaims, lib/google-claims.ts).
  let tokenInfo: GoogleTokenInfo;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!res.ok) {
      return { error: "Invalid Google token." };
    }
    tokenInfo = await res.json();
  } catch {
    return { error: "Failed to verify Google token." };
  }

  const claims = verifyGoogleClaims(tokenInfo, clientId);
  if (!claims.ok) {
    return { error: claims.error };
  }
  const { email, firstName, lastName, sub } = claims.identity;

  // Resolve the login contact for (email, channel) — accountless shopper first,
  // then the canonical B2B row (snake_case row or null; never inactive).
  const existing = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as LoginCandidate | null;

  if (existing) {
    // Existing contact — log them in (email-based account linking). Google just
    // proved the bearer owns this inbox, so stamp email_verified=true (a merge —
    // other metafield keys, incl. self_registered, are preserved). This is what
    // upgrades a self-registered contact into net-terms eligibility.
    if (existing.metafields?.email_verified !== true) {
      try {
        await mergeContactMetafields(existing.id, { email_verified: true });
      } catch (e) {
        console.error("[googleSignIn] email_verified stamp failed (non-fatal):", e);
      }
    }

    await setSession(existing.id, existing.email);
    refresh(); // acting user's view refreshes; shared data cache stays intact

    return {
      session: {
        contactId: existing.id,
        email: existing.email,
        firstName: existing.first_name ?? "",
        lastName: existing.last_name ?? "",
      },
    };
  }

  // New person — create an accountless contact with no password. No
  // self_registered marker: Google verified inbox ownership at creation, so the
  // fail-closed net-terms policy (which targets unproven self-registrations)
  // does not apply. email_verified recorded for consistency.
  let contact;
  try {
    contact = await createAccountlessContact({
      email,
      firstName,
      lastName,
      attributes: { googleSub: sub },
      metafields: { email_verified: true },
    });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      // The accountless (channel, email) slot is occupied but wasn't a login
      // candidate — an INACTIVE (deactivated) contact, or a concurrent
      // registration race. Fail closed with a neutral message rather than
      // surfacing an unhandled error.
      return { error: "We couldn't sign you in with Google. Please sign in with your email and password, or contact support." };
    }
    throw e;
  }

  await setSession(contact.id, contact.email);
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
