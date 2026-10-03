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

test("the gone body path is never itself gone; selfOrigin follows $HOSTNAME", async () => {
  const { GONE_BODY_PATH, selfOrigin } = await import("./gone-paths.ts");
  assert.equal(goneCandidate(GONE_BODY_PATH, "GET"), false);
  const prev = process.env.HOSTNAME;
  process.env.HOSTNAME = "f28e0b294374";
  assert.equal(selfOrigin("3000"), "http://f28e0b294374:3000");
  process.env.HOSTNAME = "0.0.0.0";
  assert.equal(selfOrigin("3011"), "http://127.0.0.1:3011");
  if (prev === undefined) delete process.env.HOSTNAME; else process.env.HOSTNAME = prev;
});
