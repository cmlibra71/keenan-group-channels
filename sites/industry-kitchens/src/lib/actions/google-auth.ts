"use server";

import { revalidatePath } from "next/cache";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession } from "@/lib/auth";
import { verifyGoogleClaims, type GoogleTokenInfo } from "@/lib/google-claims";

type GoogleSignInResult = {
  error?: string;
  session?: {
    customerId: number;
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

  // Find existing customer by email + channel (returns a snake_case customer row).
  const existing = await customerService.findByEmailAndChannel(email, CHANNEL_ID);

  if (existing) {
    // Existing customer — log them in (email-based account linking)
    await setSession(existing.id, existing.email);
    revalidatePath("/", "layout");

    return {
      session: {
        customerId: existing.id,
        email: existing.email,
        firstName: existing.first_name ?? "",
        lastName: existing.last_name ?? "",
      },
    };
  }

  // New customer — create account without password
  const customer = (await customerService.create({
    originChannelId: CHANNEL_ID,
    email,
    firstName,
    lastName,
    isActive: true,
    attributes: { googleSub: sub },
  })) as { id: number; email: string; first_name: string; last_name: string };

  await setSession(customer.id, customer.email);
  revalidatePath("/", "layout");

  return {
    session: {
      customerId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
    },
  };
}
