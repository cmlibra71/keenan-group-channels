import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDateOfBirth,
  membershipJoinIntent,
  normaliseDateOfBirth,
  planPriceLine,
  wantsMembershipJoin,
  MEMBERSHIP_JOIN_PITCH,
  MEMBERSHIP_JOIN_NOTHING_CHARGED,
  membershipJoinMetafieldPatch,
} from "./checkout-join";

test("the tick is read the same way whichever shape the form posts", () => {
  for (const on of ["on", "1", "true", "yes", "TRUE", " on "]) {
    assert.equal(wantsMembershipJoin(on), true, `${on} should read as ticked`);
  }
  for (const off of [null, undefined, "", "0", "false", "no", "off"]) {
    assert.equal(wantsMembershipJoin(off as string | null), false, `${off} should read as unticked`);
  }
});

test("a birthday typed as DD/MM/YYYY becomes an ISO date", () => {
  assert.equal(normaliseDateOfBirth("01/04/1975"), "1975-04-01");
  assert.equal(normaliseDateOfBirth("1/4/1975"), "1975-04-01");
  assert.equal(normaliseDateOfBirth("01-04-1975"), "1975-04-01");
});

test("a native date input's ISO value is taken as-is", () => {
  assert.equal(normaliseDateOfBirth("1975-04-01"), "1975-04-01");
});

test("31 February is refused, not rolled forward into a birthday nobody typed", () => {
  assert.equal(normaliseDateOfBirth("31/02/1975"), null);
  assert.equal(normaliseDateOfBirth("29/02/1975"), null);
  assert.equal(normaliseDateOfBirth("29/02/1976"), "1976-02-29");
});

test("nonsense, a future year and an impossible age all read as 'not given'", () => {
  const nextYear = new Date().getUTCFullYear() + 1;
  assert.equal(normaliseDateOfBirth(""), null);
  assert.equal(normaliseDateOfBirth("   "), null);
  assert.equal(normaliseDateOfBirth("yesterday"), null);
  assert.equal(normaliseDateOfBirth("13/13/1975"), null);
  assert.equal(normaliseDateOfBirth(`01/04/${nextYear}`), null);
  assert.equal(normaliseDateOfBirth("01/04/1850"), null);
  assert.equal(normaliseDateOfBirth(42 as unknown as string), null);
});

test("an ISO birthday round-trips back to what the shopper typed", () => {
  assert.equal(formatDateOfBirth("1975-04-01"), "01/04/1975");
  assert.equal(formatDateOfBirth(null), "");
  assert.equal(formatDateOfBirth("nonsense"), "");
});

test("the price line reads off the plan, and says nothing when there is no price", () => {
  assert.equal(planPriceLine("14.9500", "month"), "$14.95 per month");
  assert.equal(planPriceLine(143.5, "year"), "$143.50 per year");
  assert.equal(planPriceLine(null, "month"), null);
  assert.equal(planPriceLine(0, "month"), null);
  assert.equal(planPriceLine("nonsense", "month"), null);
});

test("the pitch quotes no saving — card Nyp8bkPm deleted that figure from this surface", () => {
  assert.equal(MEMBERSHIP_JOIN_PITCH, "Join the buying group and every line reprices from your next order.");
  assert.doesNotMatch(MEMBERSHIP_JOIN_PITCH, /\$|%|save/i);
  // The panel must not tell a shopper their membership changes THIS order's price.
  assert.doesNotMatch(MEMBERSHIP_JOIN_PITCH, /this order/i);
});

test("the panel's money sentence says nothing is charged with the order", () => {
  assert.match(MEMBERSHIP_JOIN_NOTHING_CHARGED, /nothing is charged with this order/i);
});

test("an unticked box is not a join", () => {
  assert.equal(membershipJoinIntent({ joinTicked: false, email: "a@b.com" }), null);
});

test("a join with nowhere to send the link is not a join", () => {
  assert.equal(membershipJoinIntent({ joinTicked: true, email: "" }), null);
  assert.equal(membershipJoinIntent({ joinTicked: true, email: "not-an-email" }), null);
});

test("a join carries the checkout's details, lower-cased email, normalised birthday", () => {
  assert.deepEqual(
    membershipJoinIntent({
      joinTicked: true,
      email: "  Tim@Example.COM ",
      firstName: " Tim ",
      lastName: " Keenan ",
      phone: " 0419032788 ",
      dateOfBirth: "02/02/1920",
    }),
    {
      email: "tim@example.com",
      firstName: "Tim",
      lastName: "Keenan",
      phone: "0419032788",
      dateOfBirth: "1920-02-02",
    }
  );
});

test("an unusable birthday leaves the join standing — it is optional on Tim's own screenshot", () => {
  const intent = membershipJoinIntent({
    joinTicked: true,
    email: "tim@example.com",
    dateOfBirth: "31/02/1975",
  });
  assert.ok(intent);
  assert.equal(intent.dateOfBirth, null);
});

test("a brand-new contact gets the birthday and the phone the checkout typed", () => {
  const patch = membershipJoinMetafieldPatch(
    { phone: "0419032788", dateOfBirth: "1975-04-01" },
    null,
    new Date("2026-09-05T01:02:03.000Z")
  );
  assert.deepEqual(patch, {
    membership_join_requested_at: "2026-09-05T01:02:03.000Z",
    date_of_birth: "1975-04-01",
    checkout_phone: "0419032788",
  });
});

test("a guest checkout may NEVER overwrite a birthday or phone we already hold", () => {
  // Chefs Depot allows guest checkout, so this is a stranger typing a known customer's address.
  const patch = membershipJoinMetafieldPatch(
    { phone: "0400000000", dateOfBirth: "1901-01-01" },
    { date_of_birth: "1975-04-01", checkout_phone: "0419032788" },
    new Date("2026-09-05T01:02:03.000Z")
  );
  assert.deepEqual(patch, { membership_join_requested_at: "2026-09-05T01:02:03.000Z" });
});

test("a blank value we hold is still a blank — the join fills it", () => {
  const patch = membershipJoinMetafieldPatch(
    { phone: "0419032788", dateOfBirth: "1975-04-01" },
    { date_of_birth: "  ", checkout_phone: null }
  );
  assert.equal(patch.date_of_birth, "1975-04-01");
  assert.equal(patch.checkout_phone, "0419032788");
});

test("the join stamp is always written — it is the record that somebody asked", () => {
  const patch = membershipJoinMetafieldPatch(
    { phone: "", dateOfBirth: null },
    { date_of_birth: "1975-04-01" }
  );
  assert.equal(Object.keys(patch).length, 1);
  assert.ok(typeof patch.membership_join_requested_at === "string");
});
