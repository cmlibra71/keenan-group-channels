import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AU_STATES,
  normaliseAuState,
  isValidAuPostcode,
  auAddressNeedsCorrection,
} from "./au-address.ts";

test("exposes the 8 states and territories", () => {
  assert.equal(AU_STATES.length, 8);
  assert.deepEqual(
    AU_STATES.map((s) => s.code),
    ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]
  );
});

test("normalises codes and full names, any case, to the canonical code", () => {
  assert.equal(normaliseAuState("VIC"), "VIC");
  assert.equal(normaliseAuState("wa"), "WA"); // legacy saved-address casing
  assert.equal(normaliseAuState(" Victoria "), "VIC"); // Google Places long name
  assert.equal(normaliseAuState("Australian Capital Territory"), "ACT");
});

test("returns null for anything that isn't an AU state", () => {
  assert.equal(normaliseAuState("North Eastern Australia"), null); // the reported bad value
  assert.equal(normaliseAuState(""), null);
  assert.equal(normaliseAuState(null), null);
  assert.equal(normaliseAuState(undefined), null);
});

test("accepts only 4-digit postcodes", () => {
  assert.equal(isValidAuPostcode("3140"), true);
  assert.equal(isValidAuPostcode("0800"), true);
  assert.equal(isValidAuPostcode(" 3140 "), true);
  assert.equal(isValidAuPostcode("1616846841"), false); // the reported bad value
  assert.equal(isValidAuPostcode("ABCDE"), false);
  assert.equal(isValidAuPostcode("314"), false);
  assert.equal(isValidAuPostcode(""), false);
  assert.equal(isValidAuPostcode(null), false);
});

test("flags saved AU addresses that can't be used for delivery", () => {
  const good = { countryCode: "AU", stateOrProvince: "VIC", postalCode: "3140" };
  assert.equal(auAddressNeedsCorrection(good), false);
  // Full name / lower case still normalises, so it is NOT a correction case.
  assert.equal(
    auAddressNeedsCorrection({ ...good, stateOrProvince: "victoria" }),
    false
  );
  // The two reported bad values.
  assert.equal(
    auAddressNeedsCorrection({ ...good, stateOrProvince: "North Eastern Australia" }),
    true
  );
  assert.equal(auAddressNeedsCorrection({ ...good, postalCode: "1616846841" }), true);
  // Blank state — 3 such rows existed in production.
  assert.equal(auAddressNeedsCorrection({ ...good, stateOrProvince: "" }), true);
  // A missing country code means Australia (the address book only stores AU).
  assert.equal(
    auAddressNeedsCorrection({ stateOrProvince: "QLD", postalCode: "4000" }),
    false
  );
  assert.equal(auAddressNeedsCorrection({ stateOrProvince: "", postalCode: "4000" }), true);
});

test("never flags a non-AU address — we have no region list for those", () => {
  assert.equal(
    auAddressNeedsCorrection({
      countryCode: "NZ",
      stateOrProvince: "Auckland",
      postalCode: "1010",
    }),
    false
  );
});
