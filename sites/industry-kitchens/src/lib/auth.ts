import { cookies } from "next/headers";
import { CHANNEL_ID } from "./channel";
import { signSessionToken, verifySessionToken, type SessionPayload } from "./token";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return secret;
}

// signToken/verifyToken keep their external signatures; the HMAC sign/verify,
// expiry and channel-binding are the pure token codec (lib/token.ts). Here we
// just supply this channel's secret, id and the clock.
export async function signToken(payload: SessionPayload): Promise<string> {
  return signSessionToken(payload, {
    secret: getSecret(),
    channelId: CHANNEL_ID,
    maxAgeSeconds: SESSION_MAX_AGE,
    now: Date.now(),
  });
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  return verifySessionToken(token, { secret: getSecret(), channelId: CHANNEL_ID, now: Date.now() });
}

export async function getSession(): Promise<{ customerId: number; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSession(customerId: number, email: string): Promise<void> {
  const cookieStore = await cookies();
  const token = await signToken({ customerId, email });
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
