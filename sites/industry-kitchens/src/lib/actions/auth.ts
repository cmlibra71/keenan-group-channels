"use server";

import { redirect } from "next/navigation";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession, clearSession } from "@/lib/auth";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const passwordHash = await hashPassword(password);
  const customer = await customerService.findByEmailAndChannel(email, CHANNEL_ID) as {
    id: number;
    email: string;
    passwordHash: string | null;
  } | null;

  if (!customer || customer.passwordHash !== passwordHash) {
    return { error: "Invalid email or password." };
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

  // Check if customer already exists
  const existing = await customerService.findByEmailAndChannel(email, CHANNEL_ID);
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(password);

  const customer = await customerService.create({
    originChannelId: CHANNEL_ID,
    email,
    passwordHash,
    firstName,
    lastName,
    isActive: true,
  }) as { id: number; email: string };

  await setSession(customer.id, customer.email);
  redirect("/account");
}

export async function logout() {
  await clearSession();
  redirect("/account");
}
