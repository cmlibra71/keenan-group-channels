import { test } from "node:test";
import assert from "node:assert/strict";
import { deniedForUnverifiedSelfRegistration } from "./net-terms-policy.ts";

test("denies self-registered customers who have not verified their email", () => {
  assert.equal(deniedForUnverifiedSelfRegistration({ self_registered: true }), true);
  assert.equal(
    deniedForUnverifiedSelfRegistration({ self_registered: true, email_verified: false }),
    true
  );
});

test("allows self-registered customers who HAVE verified their email", () => {
  assert.equal(
    deniedForUnverifiedSelfRegistration({ self_registered: true, email_verified: true }),
    false
  );
});

test("allows non-self-registered customers (staff / Zoey imports)", () => {
  assert.equal(deniedForUnverifiedSelfRegistration(null), false);
  assert.equal(deniedForUnverifiedSelfRegistration({}), false);
  assert.equal(deniedForUnverifiedSelfRegistration({ self_registered: false }), false);
});

test("only the literal boolean true self_registered triggers the rule", () => {
  // a truthy-but-not-true value must not deny (defensive against bad data)
  assert.equal(deniedForUnverifiedSelfRegistration({ self_registered: "true" }), false);
});
