import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Structural guards on the three things that cannot be proved by unit-testing a
// pure function, and that would each be a money bug if they silently changed:
//
//   1. The grant endpoint is INERT unless the server holds a secret.
//   2. NOTHING about a test session is written down anywhere.
//   3. The "no money will be taken" banner is impossible to render without an
//      active test session, and impossible to have a test session without.
//
// These read the real source rather than a copy of it, so they fail if someone
// rewires the checkout, not merely if they edit a fixture.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const routeSrc = read("../../app/api/test/checkout-session/route.ts");
const sessionSrc = read("./test-session.ts");
const pageSrc = read("../../app/checkout/page.tsx");
const formSrc = read("../../components/checkout/CheckoutForm.tsx");

test("the grant endpoint is inert unless TEST_CHECKOUT_SECRET is configured", () => {
  assert.match(routeSrc, /process\.env\.TEST_CHECKOUT_SECRET/);
  // 404 (the feature does not exist) before anything else happens, on every verb.
  assert.equal(routeSrc.match(/status: 404/g)?.length, 3, "POST, GET and DELETE must all 404");
  // The secret must be checked, in constant time, before a cookie is ever minted.
  assert.match(routeSrc, /timingSafeEqual/);
  const gateIndex = routeSrc.indexOf("secretsMatch(secret, configuredSecret)");
  const mintIndex = routeSrc.indexOf("startTestCheckoutSession()");
  assert.ok(gateIndex > 0 && mintIndex > gateIndex, "the secret is checked before the mint");
});

test("the grant is never keyed on public input", () => {
  // No query string, header or referrer may confer this. Only the shared secret
  // in the request body does.
  for (const banned of ["searchParams", "nextUrl.search", "request.headers", "cookies.get"]) {
    assert.ok(!routeSrc.includes(banned), `the grant endpoint must not read ${banned}`);
  }
});

test("nothing about a test session is written down anywhere", () => {
  // Comments discuss the retired stored flag by name; only the CODE matters.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  const both = strip(routeSrc) + strip(sessionSrc);
  for (const banned of [
    "channelSettingsService",
    "storeSettingsService",
    "settingsService",
    "upsert",
    ".insert(",
    "commerceDb",
    "drizzle",
    "payments_test_mode",
  ]) {
    assert.ok(!both.includes(banned), `a test session must not persist anything (${banned})`);
  }
});

test("the session is short-lived: minutes to an hour, never days", () => {
  // Read from source: test-session.ts pulls in next/headers and the channel
  // guard, neither of which belongs in a unit test.
  const match = sessionSrc.match(/TEST_CHECKOUT_TTL_SECONDS = ([^;]+);/);
  assert.ok(match, "TEST_CHECKOUT_TTL_SECONDS must be declared");
  const ttl = Function(`"use strict"; return (${match![1]});`)() as number;
  assert.ok(ttl >= 5 * 60, "long enough to walk a checkout");
  assert.ok(ttl <= 60 * 60, "never longer than an hour");
});

test("the banner is driven by the ephemeral session and nothing else", () => {
  // The page must pass the SESSION flag, not the resolved test-vs-live mode:
  // wantTestMode is true by default in dev and would decouple the warning from
  // the capability.
  assert.match(pageSrc, /testMode=\{testSession\}/);
  assert.ok(!pageSrc.includes("testMode={wantTestMode}"));

  // And the banner's only gate in the form is that prop.
  assert.match(formSrc, /\{testMode && \(/);
  assert.match(formSrc, /data-testid="test-checkout-banner"/);
  assert.equal(formSrc.match(/data-testid="test-checkout-banner"/g)?.length, 1);
});

test("a test session that cannot resolve a test gateway refuses the card", () => {
  // Fail closed: no test key means the card option is removed, never mounted on
  // a live key.
  assert.match(pageSrc, /cardUnavailableInTestSession/);
  assert.match(pageSrc, /paymentMethods\.filter\(\(m\) => m\.id !== "stripe"\)/);
  assert.match(pageSrc, /paymentMethods=\{offeredPaymentMethods\}/);
});

test("the banner names the test cards a tester needs", () => {
  for (const card of [
    "4242 4242 4242 4242",
    "4000 0000 0000 0002",
    "4000 0025 0000 3155",
    "4000 0000 0000 9995",
  ]) {
    assert.ok(formSrc.includes(card), `the banner must list ${card}`);
  }
  assert.match(formSrc, /no money will be taken/i);
});
