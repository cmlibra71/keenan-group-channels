// ============================================================================
// Test-checkout-session token codec — pure HMAC-SHA256 sign/verify.
//
// Deliberately its own codec, separate from the shopper session token, because a
// test-checkout grant is a different and far more dangerous capability than being
// logged in: holding it makes the checkout mount Stripe Elements on the TEST
// publishable key and create the PaymentIntent on the TEST secret key.
//
// Everything security-critical is injected (secret, channel, purpose string,
// clock), so tamper detection, expiry, channel binding and purpose binding are
// unit-testable with no cookies and no env (see test-session-token.test.ts).
//
// THE HMAC KEY IS THE SERVER SECRET ITSELF (`TEST_CHECKOUT_SECRET`). That is the
// point: unset or rotate the secret and every outstanding token stops verifying
// immediately. Nothing about a test session is written down anywhere, so this
// short-lived cookie IS the whole capability.
// ============================================================================

const encoder = new TextEncoder();

/**
 * Purpose binding. A token minted for anything else (a shopper session, a preview
 * link) must never verify here even if a secret were ever shared between them.
 */
export const TEST_CHECKOUT_PURPOSE = "stripe-test-checkout";

const TEST_CHECKOUT_VERSION = 1;

export type TestSessionSignOpts = {
  secret: string;
  channelId: number;
  maxAgeSeconds: number;
  now: number;
};

export type TestSessionVerifyOpts = {
  secret: string;
  channelId: number;
  now: number;
};

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

export async function signTestSessionToken(opts: TestSessionSignOpts): Promise<string> {
  if (!opts.secret) throw new Error("A test-checkout secret is required to mint a token.");
  const key = await getKey(opts.secret);
  const data = JSON.stringify({
    v: TEST_CHECKOUT_VERSION,
    p: TEST_CHECKOUT_PURPOSE,
    channelId: opts.channelId,
    exp: opts.now + opts.maxAgeSeconds * 1000,
  });
  const dataBytes = encoder.encode(data);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes.buffer as ArrayBuffer);
  return `${toBase64Url(dataBytes.buffer as ArrayBuffer)}.${toBase64Url(sig)}`;
}

/**
 * True only for a token this server signed, for THIS channel, for THIS purpose,
 * that has not expired. Every other input — missing, malformed, forged, expired,
 * cross-channel, wrong version — is false. There is no error path that leaks a
 * true, and no secret means false (the capability does not exist).
 */
export async function verifyTestSessionToken(
  token: string | undefined | null,
  opts: TestSessionVerifyOpts
): Promise<boolean> {
  if (!token || !opts.secret) return false;
  try {
    const [dataB64, sigB64] = token.split(".");
    if (!dataB64 || !sigB64) return false;

    const key = await getKey(opts.secret);
    const dataBuf = fromBase64Url(dataB64);
    const sigBuf = fromBase64Url(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(dataBuf));
    if (payload.v !== TEST_CHECKOUT_VERSION) return false;
    if (payload.p !== TEST_CHECKOUT_PURPOSE) return false;
    if (payload.channelId !== opts.channelId) return false;
    if (typeof payload.exp !== "number" || payload.exp <= opts.now) return false;

    return true;
  } catch {
    return false;
  }
}
