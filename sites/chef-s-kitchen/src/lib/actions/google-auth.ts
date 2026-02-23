"use server";

import { revalidatePath } from "next/cache";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession } from "@/lib/auth";

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

  // Verify the ID token with Google
  let tokenInfo: {
    aud: string;
    email: string;
    email_verified: string;
    given_name?: string;
    family_name?: string;
    sub: string;
  };

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

  // Validate audience matches our client ID
  if (tokenInfo.aud !== clientId) {
    return { error: "Token audience mismatch." };
  }

  if (tokenInfo.email_verified !== "true") {
    return { error: "Google email is not verified." };
  }

  const email = tokenInfo.email.toLowerCase();
  const firstName = tokenInfo.given_name || "";
  const lastName = tokenInfo.family_name || "";

  // Find existing customer by email + channel
  const existing = (await customerService.findByEmailAndChannel(email, CHANNEL_ID)) as {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;

  if (existing) {
    // Existing customer — log them in (email-based account linking)
    await setSession(existing.id, existing.email);
    revalidatePath("/", "layout");

    return {
      session: {
        customerId: existing.id,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
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
    attributes: { googleSub: tokenInfo.sub },
  })) as { id: number; email: string; firstName: string; lastName: string };

  await setSession(customer.id, customer.email);
  revalidatePath("/", "layout");

  return {
    session: {
      customerId: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    },
  };
}
