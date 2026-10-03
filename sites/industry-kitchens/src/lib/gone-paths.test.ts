import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoneIn, goneCandidate } from "./gone-paths.ts";

test("isGoneIn normalises like the redirect lookup", () => {
  const set = new Set(["/rosso-coffee-case-study", "/pages/rosso-coffee-case-study"]);
  assert.equal(isGoneIn(set, "/Rosso-Coffee-Case-Study/?utm=x"), true);
  assert.equal(isGoneIn(set, "/pages/rosso-coffee-case-study"), true);
  assert.equal(isGoneIn(set, "/pages/about-us"), false);
  assert.equal(isGoneIn(null, "/rosso-coffee-case-study"), false);
  assert.equal(isGoneIn(new Set(), "/x"), false);
});

test("goneCandidate: GET/HEAD page addresses only", () => {
  assert.equal(goneCandidate("/rosso", "GET"), true);
  assert.equal(goneCandidate("/rosso", "HEAD"), true);
  assert.equal(goneCandidate("/rosso", "POST"), false);
  assert.equal(goneCandidate("/api/internal/gone-paths", "GET"), false);
  assert.equal(goneCandidate("/_next/static/x.js", "GET"), false);
});
