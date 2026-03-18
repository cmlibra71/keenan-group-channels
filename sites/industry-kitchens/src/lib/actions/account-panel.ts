"use server";

import { revalidatePath } from "next/cache";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { getSession, setSession, clearSession } from "@/lib/auth";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getSessionInfo() {
  const session = await getSession();
  if (!session) return null;

  const customer = (await customerService.getById(session.customerId)) as {
    firstName: string;
    lastName: string;
    email: string;
  } | null;

  if (!customer) return null;

  return {
    customerId: session.customerId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  };
}

export async function loginFromPanel(formData: FormData): Promise<{
  error?: string;
  session?: { customerId: number; email: string; firstName: string; lastName: string };
}> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const passwordHash = await hashPassword(password);
  const customer = (await customerService.findByEmailAndChannel(email, CHANNEL_ID)) as {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string | null;
  } | null;

  if (!customer || customer.passwordHash !== passwordHash) {
    return { error: "Invalid email or password." };
  }

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

export async function registerFromPanel(formData: FormData): Promise<{
  error?: string;
  session?: { customerId: number; email: string; firstName: string; lastName: string };
}> {
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

export async function logoutFromPanel() {
  await clearSession();
  revalidatePath("/", "layout");
}
