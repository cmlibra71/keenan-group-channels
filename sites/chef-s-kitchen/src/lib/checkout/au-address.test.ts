import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_STATES, normaliseAuState, isValidAuPostcode } from "./au-address.ts";

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
