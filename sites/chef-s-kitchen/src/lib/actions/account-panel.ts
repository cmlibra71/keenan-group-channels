"use server";

import { refresh } from "next/cache";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { getSession, setSession, clearSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { createAccountlessContact, EmailTakenError, type LoginCandidate } from "@/lib/contact-auth";
import { tooManyAttempts, recordFailure } from "@/lib/login-throttle";

type PanelSession = { contactId: number; email: string; firstName: string; lastName: string };

export async function getSessionInfo() {
  const session = await getSession();
  if (!session) return null;

  // getById goes through transformRow → snake_case keys.
  const contact = (await contactService.getById(session.contactId)) as {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;

  if (!contact) return null;

  return {
    contactId: session.contactId,
    email: contact.email,
    firstName: contact.first_name ?? "",
    lastName: contact.last_name ?? "",
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

  const candidate = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as LoginCandidate | null;

  const { valid, needsRehash } = await verifyPassword(password, candidate?.password_hash);
  if (!candidate || !valid) {
    recordFailure(email);
    return { error: "Invalid email or password." };
  }
  if (needsRehash) {
    try {
      // contactService.update hashes plaintext `password` to bcrypt itself.
      await contactService.update(candidate.id, { password });
    } catch {
      /* non-fatal */
    }
  }

  await setSession(candidate.id, candidate.email);
  refresh(); // acting user's view refreshes; shared data cache stays intact

  return {
    session: {
      contactId: candidate.id,
      email: candidate.email,
      firstName: candidate.first_name ?? "",
      lastName: candidate.last_name ?? "",
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

  // Same copy for B2B-owned and accountless-taken emails (enumeration safety).
  if (!(await contactService.isEmailAvailableForChannel(email, CHANNEL_ID))) {
    return { error: "An account with this email already exists." };
  }

  let contact;
  try {
    contact = await createAccountlessContact({
      email,
      password,
      firstName,
      lastName,
      // Same unverified marker as the form register — see lib/actions/auth.ts.
      metafields: { self_registered: true, email_verified: false },
    });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return { error: "An account with this email already exists." };
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

export async function logoutFromPanel() {
  await clearSession();
  refresh(); // acting user's view refreshes; shared data cache stays intact
}
