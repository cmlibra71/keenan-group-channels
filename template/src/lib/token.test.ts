import { test } from "node:test";
import assert from "node:assert/strict";
import { signSessionToken, verifySessionToken } from "./token.ts";

const SECRET = "unit-test-secret";
const CH = 1;
const T0 = 1_000_000;
const payload = { contactId: 42, email: "a@b.co" };

// Forge a token with the REAL HMAC key but arbitrary payload JSON, so tests can
// prove the version/shape gates (not the signature check) reject bad payloads.
async function forgeToken(payloadJson: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const dataBytes = encoder.encode(JSON.stringify(payloadJson));
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes.buffer as ArrayBuffer);
  const b64url = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let str = "";
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return `${b64url(dataBytes.buffer as ArrayBuffer)}.${b64url(sig)}`;
}

test("round-trips a valid token", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: CH, maxAgeSeconds: 100, now: T0 });
  const out = await verifySessionToken(token, { secret: SECRET, channelId: CH, now: T0 });
  assert.deepEqual(out, payload);
});

test("rejects an expired token", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: CH, maxAgeSeconds: 100, now: T0 });
  // exp = T0 + 100*1000; verify just past it
  const out = await verifySessionToken(token, { secret: SECRET, channelId: CH, now: T0 + 100 * 1000 + 1 });
  assert.equal(out, null);
});

test("accepts a token exactly at the expiry boundary", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: CH, maxAgeSeconds: 100, now: T0 });
  // exp < now is the reject condition, so exp == now still verifies
  const out = await verifySessionToken(token, { secret: SECRET, channelId: CH, now: T0 + 100 * 1000 });
  assert.deepEqual(out, payload);
});

test("rejects a tampered signature", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: CH, maxAgeSeconds: 100, now: T0 });
  const [data, sig] = token.split(".");
  const flipped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
  const out = await verifySessionToken(`${data}.${flipped}`, { secret: SECRET, channelId: CH, now: T0 });
  assert.equal(out, null);
});

test("rejects a token signed with a different secret", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: CH, maxAgeSeconds: 100, now: T0 });
  const out = await verifySessionToken(token, { secret: "other-secret", channelId: CH, now: T0 });
  assert.equal(out, null);
});

test("rejects a token bound to a different channel (no cross-storefront replay)", async () => {
  const token = await signSessionToken(payload, { secret: SECRET, channelId: 1, maxAgeSeconds: 100, now: T0 });
  const out = await verifySessionToken(token, { secret: SECRET, channelId: 2, now: T0 });
  assert.equal(out, null);
});

test("rejects malformed tokens", async () => {
  const opts = { secret: SECRET, channelId: CH, now: T0 };
  assert.equal(await verifySessionToken("garbage", opts), null);
  assert.equal(await verifySessionToken("", opts), null);
  assert.equal(await verifySessionToken("only.onedot", opts), null);
});

// A validly-signed pre-cutover (v1) token carried `customerId` and no version
// marker. It must NOT verify — customer ids and contact ids are different
// numeric sequences, so honouring it would log the bearer in as whichever
// CONTACT happens to share the number.
test("rejects a v1 (customerId-subject) token even with a valid signature", async () => {
  const v1Token = await forgeToken({ customerId: 42, email: "a@b.co", channelId: CH, exp: T0 + 100_000 });
  assert.equal(await verifySessionToken(v1Token, { secret: SECRET, channelId: CH, now: T0 }), null);
});

test("rejects a wrong-version token and a non-numeric contactId", async () => {
  const opts = { secret: SECRET, channelId: CH, now: T0 };
  const v3 = await forgeToken({ v: 3, contactId: 42, email: "a@b.co", channelId: CH, exp: T0 + 100_000 });
  assert.equal(await verifySessionToken(v3, opts), null);
  const stringId = await forgeToken({ v: 2, contactId: "42", email: "a@b.co", channelId: CH, exp: T0 + 100_000 });
  assert.equal(await verifySessionToken(stringId, opts), null);
});
