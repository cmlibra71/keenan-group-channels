import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseEmail, looksLikeEmail, decideEmailProbe } from "./account-prompt.ts";

test("normalises to trimmed lower case", () => {
  assert.equal(normaliseEmail("  Tim@TKRestaurantConsulting.com.AU "), "tim@tkrestaurantconsulting.com.au");
  assert.equal(normaliseEmail(null), "");
  assert.equal(normaliseEmail(undefined), "");
});

test("recognises a plausible address, rejects a half-typed one", () => {
  assert.equal(looksLikeEmail("tim@tkrestaurantconsulting.com.au"), true);
  assert.equal(looksLikeEmail("a@b.co"), true);
  assert.equal(looksLikeEmail("tim@"), false);
  assert.equal(looksLikeEmail("tim@example"), false);
  assert.equal(looksLikeEmail("tim example.com"), false);
  assert.equal(looksLikeEmail(""), false);
});

const decide = (over: Partial<Parameters<typeof decideEmailProbe>[0]>) =>
  decideEmailProbe({ email: "tim@example.com", isSignedIn: false, known: new Map(), ...over });

test("asks about a complete address typed by a guest", () => {
  assert.deepEqual(decide({}), { action: "ask", email: "tim@example.com" });
});

test("asks about the normalised address, whatever the shopper's casing", () => {
  assert.deepEqual(decide({ email: " TIM@Example.com " }), { action: "ask", email: "tim@example.com" });
});

test("never asks for a shopper who is already signed in", () => {
  assert.deepEqual(decide({ isSignedIn: true }), { action: "skip" });
});

test("does not ask about a half-typed address", () => {
  assert.deepEqual(decide({ email: "tim@exa" }), { action: "skip" });
});

test("reuses a known answer instead of asking again", () => {
  const known = new Map([["tim@example.com", true]]);
  assert.deepEqual(decide({ known }), { action: "known", hasAccount: true });
  assert.deepEqual(decide({ email: "TIM@example.com ", known }), { action: "known", hasAccount: true });
  // A remembered "no account" is just as good an answer — still no second query.
  assert.deepEqual(decide({ known: new Map([["tim@example.com", false]]) }), {
    action: "known",
    hasAccount: false,
  });
});

test("asks about an address we have not seen, even with others cached", () => {
  const known = new Map([["someone.else@example.com", true]]);
  assert.deepEqual(decide({ known }), { action: "ask", email: "tim@example.com" });
});
