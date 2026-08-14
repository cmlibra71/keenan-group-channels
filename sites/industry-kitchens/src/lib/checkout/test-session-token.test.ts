import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signTestSessionToken,
  verifyTestSessionToken,
  TEST_CHECKOUT_PURPOSE,
} from "./test-session-token";

// The token IS the whole capability: hold a valid one and the checkout mounts
// Stripe Elements on the TEST publishable key and creates the PaymentIntent on
// the TEST secret key. Nothing is stored anywhere to back it up, so every one of
// these "false" cases is the difference between a live checkout and a test one.
//
// Anything other than a token this server signed, for this channel, for this
// purpose, still in date, must read FALSE — which means the LIVE key, exactly as
// today.

const SECRET = "server-side-secret-nobody-can-guess";
const CHANNEL = 2;
const NOW = 1_700_000_000_000;
const TTL = 30 * 60;

async function mint(overrides: Partial<Parameters<typeof signTestSessionToken>[0]> = {}) {
  return signTestSessionToken({
    secret: SECRET,
    channelId: CHANNEL,
    maxAgeSeconds: TTL,
    now: NOW,
    ...overrides,
  });
}

test("a token this server just minted verifies", async () => {
  const token = await mint();
  assert.equal(await verifyTestSessionToken(token, { secret: SECRET, channelId: CHANNEL, now: NOW }), true);
});

test("NO cookie at all is false (live key)", async () => {
  const opts = { secret: SECRET, channelId: CHANNEL, now: NOW };
  assert.equal(await verifyTestSessionToken(undefined, opts), false);
  assert.equal(await verifyTestSessionToken(null, opts), false);
  assert.equal(await verifyTestSessionToken("", opts), false);
});

test("a FORGED cookie is false (live key)", async () => {
  const opts = { secret: SECRET, channelId: CHANNEL, now: NOW };
  // Garbage, and plausible-looking garbage.
  assert.equal(await verifyTestSessionToken("nonsense", opts), false);
  assert.equal(await verifyTestSessionToken("a.b", opts), false);

  // A well-formed payload the attacker built themselves, unsigned.
  const payload = Buffer.from(
    JSON.stringify({ v: 1, p: TEST_CHECKOUT_PURPOSE, channelId: CHANNEL, exp: NOW + 10_000 })
  ).toString("base64url");
  assert.equal(await verifyTestSessionToken(`${payload}.${payload}`, opts), false);

  // A real token whose payload has been tampered with (extended expiry).
  const real = await mint();
  const [, sig] = real.split(".");
  assert.equal(await verifyTestSessionToken(`${payload}.${sig}`, opts), false);

  // A real token signed with a DIFFERENT secret (e.g. a stale/rotated one).
  const otherSecret = await mint({ secret: "some-other-secret" });
  assert.equal(await verifyTestSessionToken(otherSecret, opts), false);
});

test("an EXPIRED cookie is false (live key)", async () => {
  const token = await mint();
  const justBefore = NOW + TTL * 1000 - 1;
  const atExpiry = NOW + TTL * 1000;
  assert.equal(
    await verifyTestSessionToken(token, { secret: SECRET, channelId: CHANNEL, now: justBefore }),
    true
  );
  assert.equal(
    await verifyTestSessionToken(token, { secret: SECRET, channelId: CHANNEL, now: atExpiry }),
    false
  );
  assert.equal(
    await verifyTestSessionToken(token, {
      secret: SECRET,
      channelId: CHANNEL,
      now: atExpiry + 24 * 60 * 60 * 1000,
    }),
    false
  );
});

test("a token minted for ANOTHER storefront is false (live key)", async () => {
  const token = await mint({ channelId: 1 });
  assert.equal(await verifyTestSessionToken(token, { secret: SECRET, channelId: 2, now: NOW }), false);
});

test("with NO server secret nothing verifies — the capability does not exist", async () => {
  const token = await mint();
  assert.equal(await verifyTestSessionToken(token, { secret: "", channelId: CHANNEL, now: NOW }), false);
});

test("a token cannot be minted without a secret", async () => {
  await assert.rejects(() =>
    signTestSessionToken({ secret: "", channelId: CHANNEL, maxAgeSeconds: TTL, now: NOW })
  );
});

test("the grant is short-lived by construction — lifetime is bounded by the mint", async () => {
  const token = await mint({ maxAgeSeconds: 60 });
  assert.equal(
    await verifyTestSessionToken(token, { secret: SECRET, channelId: CHANNEL, now: NOW + 61_000 }),
    false
  );
});
