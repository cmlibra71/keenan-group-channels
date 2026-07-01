import { test } from "node:test";
import assert from "node:assert/strict";
import { signSessionToken, verifySessionToken } from "./token.ts";

const SECRET = "unit-test-secret";
const CH = 1;
const T0 = 1_000_000;
const payload = { customerId: 42, email: "a@b.co" };

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
