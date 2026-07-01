import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyGoogleClaims, type GoogleTokenInfo } from "./google-claims.ts";

const info = (over: Partial<GoogleTokenInfo>): GoogleTokenInfo => ({
  aud: "client-123",
  email: "User@Example.com",
  email_verified: "true",
  given_name: "Ada",
  family_name: "Lovelace",
  sub: "google-sub-1",
  ...over,
});

test("accepts a verified token for the right audience and normalizes identity", () => {
  const r = verifyGoogleClaims(info({}), "client-123");
  assert.deepEqual(r, {
    ok: true,
    identity: { email: "user@example.com", firstName: "Ada", lastName: "Lovelace", sub: "google-sub-1" },
  });
});

test("rejects an audience mismatch", () => {
  const r = verifyGoogleClaims(info({}), "different-client");
  assert.deepEqual(r, { ok: false, error: "Token audience mismatch." });
});

test("rejects an unverified email (email_verified !== 'true')", () => {
  assert.equal(verifyGoogleClaims(info({ email_verified: "false" }), "client-123").ok, false);
  // must be the literal string "true" — a boolean-ish value does not pass
  assert.equal(verifyGoogleClaims(info({ email_verified: "1" }), "client-123").ok, false);
});

test("defaults missing given/family names to empty strings", () => {
  const r = verifyGoogleClaims(info({ given_name: undefined, family_name: undefined }), "client-123");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.identity.firstName, "");
    assert.equal(r.identity.lastName, "");
  }
});
