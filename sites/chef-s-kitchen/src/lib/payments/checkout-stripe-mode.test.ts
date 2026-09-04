import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCheckoutStripeMode } from "./checkout-stripe-mode";

const live = {
  provider: "stripe",
  testMode: false,
  credentials: { publishable_key: "pk_live_REAL", secret_key: "sk_live_REAL" },
};
const testGw = {
  provider: "stripe",
  testMode: true,
  credentials: { publishable_key: "pk_test_FAKE", secret_key: "sk_test_FAKE" },
};

// ---------------------------------------------------------------------------
// No test session: the live key, exactly as today.
// ---------------------------------------------------------------------------

test("no test session in production serves the LIVE publishable key", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_live_REAL");
  assert.equal(r.wantTestMode, false);
  assert.equal(r.testSession, false);
});

test("no test session, and only a TEST gateway configured, refuses in production", () => {
  // Unchanged prod-safe behaviour: a test key silently fails real charges, so we
  // would rather take no card than take one that cannot be charged.
  const r = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway, null);
});

test("a forged or expired cookie is simply 'no test session' — the live key", () => {
  // Cookie verification is total (see test-session-token.test.ts): anything not
  // genuinely signed, in date and for this channel arrives here as false. That
  // path must be byte-identical to an ordinary shopper's.
  const forged = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  const ordinary = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.deepEqual(forged, ordinary);
  assert.equal(forged.gateway?.credentials.publishable_key, "pk_live_REAL");
});

// ---------------------------------------------------------------------------
// Test session: the TEST gateway or nothing. Never a live fallback.
// ---------------------------------------------------------------------------

test("a test session serves the TEST publishable key even in production", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [live, testGw],
    testSession: true,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_test_FAKE");
  assert.equal(r.wantTestMode, true);
  assert.equal(r.testSession, true);
});

test("a test session with NO test gateway REFUSES — it never falls back to live", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [live],
    testSession: true,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway, null, "must not hand back the live gateway");
  assert.equal(r.testSession, true, "still a test session, so the banner still warns");
});

test("a test session with no gateways at all refuses", () => {
  const r = resolveCheckoutStripeMode({ channelEnabled: [], globalEnabled: [], testSession: true, envWantsTestMode: false });
  assert.equal(r.gateway, null);
});

test("no live key can ever leak into a test session, whatever the ordering", () => {
  const untagged = { provider: "stripe", credentials: { publishable_key: "pk_live_OTHER" } };
  for (const globalEnabled of [[live], [live, live], [live, untagged], [untagged]]) {
    const r = resolveCheckoutStripeMode({
      channelEnabled: [],
      globalEnabled,
      testSession: true,
      envWantsTestMode: false,
    });
    assert.equal(r.gateway, null);
  }
});

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------

test("testSession — the banner's only input — is false whenever there is no session", () => {
  // The checkout page passes `testSession` (not wantTestMode) to the banner, so
  // the banner cannot render without a genuine, unexpired, correctly-signed
  // cookie. Not even a dev-default test mode turns it on.
  const devDefault = resolveCheckoutStripeMode({
    channelEnabled: [], globalEnabled: [testGw],
    testSession: false,
    envWantsTestMode: true,
  });
  assert.equal(devDefault.testSession, false);
  assert.equal(devDefault.wantTestMode, true);
});

// ---------------------------------------------------------------------------
// This channel's own Stripe account (card OHDx84DK). Chefs Depot's money must
// settle in the Chefs Depot account, not in Industry Kitchens' B2C account.
// ---------------------------------------------------------------------------

const cdLive = {
  provider: "stripe",
  testMode: false,
  credentials: { publishable_key: "pk_live_CD", secret_key: "sk_live_CD" },
};
const cdTest = {
  provider: "stripe",
  testMode: true,
  credentials: { publishable_key: "pk_test_CD", secret_key: "sk_test_CD" },
};

test("a channel with its own live entry is charged on ITS account, not the global one", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [cdLive, cdTest],
    globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_live_CD");
});

test("a configured channel with no live entry REFUSES — it never borrows the global account", () => {
  // The whole point of the card: no further channel-2 intent may reach the
  // Industry Kitchens account, and a silent fallback is how it happened.
  const r = resolveCheckoutStripeMode({
    channelEnabled: [cdTest],
    globalEnabled: [live],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway, null);
});

test("a channel with no override is byte-identical to before — the global live key", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [],
    globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_live_REAL");
});

test("a test session uses the channel's OWN test account when it has one", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [cdLive, cdTest],
    globalEnabled: [live, testGw],
    testSession: true,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_test_CD");
});

test("a test session on a live-only channel falls back to the GLOBAL test account, never to live", () => {
  const r = resolveCheckoutStripeMode({
    channelEnabled: [cdLive],
    globalEnabled: [live, testGw],
    testSession: true,
    envWantsTestMode: false,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_test_FAKE");
});

test("a dev build never hands a live-only channel its own LIVE keys", () => {
  // envWantsTestMode is true on a dev build. Without the global-test preference
  // the "any enabled entry" dev fallback would take real money from a laptop.
  const r = resolveCheckoutStripeMode({
    channelEnabled: [cdLive],
    globalEnabled: [live, testGw],
    testSession: false,
    envWantsTestMode: true,
  });
  assert.equal(r.gateway?.credentials.publishable_key, "pk_test_FAKE");
});
