"use server";

import { redirect } from "next/navigation";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession, clearSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

// Basic in-memory login throttle (per container). Not a substitute for a shared
// store across replicas, but it blunts online brute-forcing of a single node.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}
function recordFailure(key: string) {
  const recent = attempts.get(key) || [];
  recent.push(Date.now());
  attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear(); // crude bound
}

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

  const customer = (await customerService.findByEmailAndChannel(email, CHANNEL_ID)) as {
    id: number;
    email: string;
    passwordHash: string | null;
  } | null;

  const { valid, needsRehash } = await verifyPassword(password, customer?.passwordHash);

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
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(password);

  const customer = (await customerService.create({
    originChannelId: CHANNEL_ID,
    email,
    passwordHash,
    firstName,
    lastName,
    isActive: true,
  })) as { id: number; email: string };

  await setSession(customer.id, customer.email);
  redirect("/account");
}

export async function logout() {
  await clearSession();
  redirect("/account");
}
