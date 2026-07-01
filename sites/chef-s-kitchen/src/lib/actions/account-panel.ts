"use server";

import { revalidatePath } from "next/cache";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { getSession, setSession, clearSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { tooManyAttempts, recordFailure } from "@/lib/login-throttle";

type PanelSession = { customerId: number; email: string; firstName: string; lastName: string };

export async function getSessionInfo() {
  const session = await getSession();
  if (!session) return null;

  // getById goes through transformRow → snake_case keys.
  const customer = (await customerService.getById(session.customerId)) as {
    first_name: string;
    last_name: string;
    email: string;
  } | null;

  if (!customer) return null;

  return {
    customerId: session.customerId,
    email: customer.email,
    firstName: customer.first_name,
    lastName: customer.last_name,
  };
}

export async function loginFromPanel(formData: FormData): Promise<{
  error?: string;
  session?: PanelSession;
}> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Same throttle + keyspace as the sign-in form action, so this alternate login path
  // can't be used to bypass the brute-force limit.
  if (tooManyAttempts(email)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const customer = await customerService.findByEmailAndChannel(email, CHANNEL_ID);

  const { valid, needsRehash } = await verifyPassword(password, customer?.password_hash);
  if (!customer || !valid) {
    recordFailure(email);
    return { error: "Invalid email or password." };
  }
  if (needsRehash) {
    try {
      await customerService.update(customer.id, { passwordHash: await hashPassword(password) });
    } catch {
      /* non-fatal */
    }
  }

  await setSession(customer.id, customer.email);
  revalidatePath("/", "layout");

  return {
    session: {
      customerId: customer.id,
      email: customer.email,
      firstName: customer.first_name ?? "",
      lastName: customer.last_name ?? "",
    },
  };
}

export async function registerFromPanel(formData: FormData): Promise<{
  error?: string;
  session?: PanelSession;
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

  // create goes through transformRow → snake_case keys.
  const customer = (await customerService.create({
    originChannelId: CHANNEL_ID,
    email,
    passwordHash,
    firstName,
    lastName,
    isActive: true,
  })) as { id: number; email: string; first_name: string; last_name: string };

  await setSession(customer.id, customer.email);
  revalidatePath("/", "layout");

  return {
    session: {
      customerId: customer.id,
      email: customer.email,
      firstName: customer.first_name ?? "",
      lastName: customer.last_name ?? "",
    },
  };
}

export async function logoutFromPanel() {
  await clearSession();
  revalidatePath("/", "layout");
}
