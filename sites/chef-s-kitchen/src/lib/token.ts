// ============================================================================
// Session-token codec — pure HMAC-SHA256 sign/verify.
//
// No next/headers, no env reads, no CHANNEL_ID: the secret, the channel binding
// and the clock (`now`) are all injected, so the security-critical behaviour —
// signature tamper detection, expiry, and channel-binding (a session minted on one
// storefront must not verify against another) — is unit-testable in isolation
// (see token.test.ts). auth.ts wraps these with SESSION_SECRET + CHANNEL_ID +
// Date.now() + the cookie store.
// ============================================================================

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret).buffer as ArrayBuffer,
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

export type SessionPayload = { customerId: number; email: string };

export type SignOpts = { secret: string; channelId: number; maxAgeSeconds: number; now: number };
export type VerifyOpts = { secret: string; channelId: number; now: number };

export async function signSessionToken(payload: SessionPayload, opts: SignOpts): Promise<string> {
  const key = await getKey(opts.secret);
  // Bind the token to THIS channel so a session minted on one storefront can't be
  // replayed against another (the cookie name is shared across channels).
  const data = JSON.stringify({
    ...payload,
    channelId: opts.channelId,
    exp: opts.now + opts.maxAgeSeconds * 1000,
  });
  const dataBytes = encoder.encode(data);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes.buffer as ArrayBuffer);
  return `${toBase64Url(dataBytes.buffer as ArrayBuffer)}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(token: string, opts: VerifyOpts): Promise<SessionPayload | null> {
  try {
    const [dataB64, sigB64] = token.split(".");
    if (!dataB64 || !sigB64) return null;

    const key = await getKey(opts.secret);
    const dataBuf = fromBase64Url(dataB64);
    const sigBuf = fromBase64Url(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(dataBuf));
    if (payload.exp < opts.now) return null;
    // Reject a validly-signed token issued for a different channel (treat as
    // logged-out). Legacy tokens minted before channel-binding carry no
    // channelId; require a re-login rather than silently honouring them.
    if (payload.channelId !== opts.channelId) return null;

    return { customerId: payload.customerId, email: payload.email };
  } catch {
    return null;
  }
}
