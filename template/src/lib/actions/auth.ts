"use server";

import { redirect } from "next/navigation";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession, clearSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
// Shared login throttle so the form login and the account-panel login share ONE keyspace.
import { tooManyAttempts, recordFailure } from "@/lib/login-throttle";

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

  const customer = await customerService.findByEmailAndChannel(email, CHANNEL_ID);

  const { valid, needsRehash } = await verifyPassword(password, customer?.password_hash);

  if (!customer || !valid) {
    recordFailure(email);
    return { error: "Invalid email or password." };
  }

  // Transparently upgrade legacy unsalted-SHA-256 hashes on successful login.
  if (needsRehash) {
    try {
      await customerService.update(customer.id, { passwordHash: await hashPassword(password) });
    } catch {
      /* non-fatal — the login still succeeds */
    }
  }

  await setSession(customer.id, customer.email);
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

  const existing = await customerService.findByEmailAndChannel(email, CHANNEL_ID);
  if (existing) {
    // Neutral response — do NOT confirm that an account with this email exists
    // (account enumeration). Mirrors login's generic error.
    return { error: "We couldn't complete your registration. If you already have an account, please sign in." };
  }

  const passwordHash = await hashPassword(password);

  const customer = (await customerService.create({
    originChannelId: CHANNEL_ID,
    email,
    passwordHash,
    firstName,
    lastName,
    isActive: true,
    // Mark self-service registrations as unverified. Checkout refuses to grant
    // B2B net terms (matched only by email string) to a self-registered customer
    // whose email ownership was never verified — otherwise anyone could register
    // with a B2B account's email and buy on invoice. Staff/Zoey-imported
    // customers carry no such marker and keep their terms.
    metafields: { self_registered: true, email_verified: false },
  })) as { id: number; email: string };

  await setSession(customer.id, customer.email);
  redirect("/account");
}

export async function logout() {
  await clearSession();
  redirect("/account");
}
