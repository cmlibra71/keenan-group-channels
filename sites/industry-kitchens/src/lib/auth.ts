import { cookies } from "next/headers";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const encoder = new TextEncoder();

function getSecret(): ArrayBuffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return encoder.encode(secret).buffer as ArrayBuffer;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export async function signToken(payload: { customerId: number; email: string }): Promise<string> {
  const key = await getKey();
  const data = JSON.stringify({ ...payload, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  const dataBytes = encoder.encode(data);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes.buffer as ArrayBuffer);
  const dataB64 = toBase64Url(dataBytes.buffer as ArrayBuffer);
  const sigB64 = toBase64Url(sig);
  return `${dataB64}.${sigB64}`;
}

export async function verifyToken(token: string): Promise<{ customerId: number; email: string } | null> {
  try {
    const [dataB64, sigB64] = token.split(".");
    if (!dataB64 || !sigB64) return null;

    const key = await getKey();
    const dataBuf = fromBase64Url(dataB64);
    const sigBuf = fromBase64Url(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(dataBuf));
    if (payload.exp < Date.now()) return null;

    return { customerId: payload.customerId, email: payload.email };
  } catch {
    return null;
  }
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
