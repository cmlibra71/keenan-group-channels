import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_CHECKOUT_MARKER,
  guestContactMetafields,
  isUnclaimedGuestRecord,
  normaliseContactEmail,
} from "./guest-contact-policy.ts";

test("an address is normalised the way the database's unique index compares it", () => {
  assert.equal(normaliseContactEmail("  Chef@Bistro.COM.AU "), "chef@bistro.com.au");
  assert.equal(normaliseContactEmail(""), null);
  assert.equal(normaliseContactEmail("   "), null);
  assert.equal(normaliseContactEmail(null), null);
  assert.equal(normaliseContactEmail(undefined), null);
});

test("a checkout-created record is born unclaimed, unproven and net-terms-denied", () => {
  const meta = guestContactMetafields();
  assert.equal(meta[GUEST_CHECKOUT_MARKER], true);
  // The inbox was never proven, so the fail-closed net-terms rule must bite.
  assert.equal(meta.self_registered, true);
  assert.equal(meta.email_verified, false);
});

test("a checkout record is not an account", () => {
  assert.equal(
    isUnclaimedGuestRecord({ password_hash: null, metafields: guestContactMetafields() }),
    true
  );
});

test("a claimed record IS an account — it has a password", () => {
  assert.equal(
    isUnclaimedGuestRecord({ password_hash: "$2b$10$hash", metafields: guestContactMetafields() }),
    false
  );
});

test("a record whose inbox has been proven is no longer claimable", () => {
  // A Google sign-in stamps email_verified on whatever row it lands on. From then
  // on nobody may take the row over with a typed password.
  assert.equal(
    isUnclaimedGuestRecord({
      password_hash: null,
      metafields: { ...guestContactMetafields(), email_verified: true },
    }),
    false
  );
});

test("the passwordless rows that existed before this card are untouched", () => {
  // A B2B contact awaiting activation, and a Google-only shopper: both are real
  // accounts reachable through Forgot password, and neither is claimable.
  assert.equal(isUnclaimedGuestRecord({ password_hash: null, metafields: {} }), false);
  assert.equal(
    isUnclaimedGuestRecord({ password_hash: null, metafields: { email_verified: true } }),
    false
  );
  assert.equal(
    isUnclaimedGuestRecord({ password_hash: null, metafields: { self_registered: true, email_verified: false } }),
    false
  );
});

test("nothing at all is not a guest record", () => {
  assert.equal(isUnclaimedGuestRecord(null), false);
  assert.equal(isUnclaimedGuestRecord(undefined), false);
  assert.equal(isUnclaimedGuestRecord({}), false);
});

test("a truthy string in the marker is not the marker", () => {
  // The metafields bag is untyped jsonb; only the boolean true counts, so a
  // stray "true" string cannot make somebody's account claimable.
  assert.equal(
    isUnclaimedGuestRecord({ password_hash: null, metafields: { [GUEST_CHECKOUT_MARKER]: "true" } }),
    false
  );
});
