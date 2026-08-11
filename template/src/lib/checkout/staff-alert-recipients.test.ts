import { test } from "node:test";
import assert from "node:assert/strict";
import { excludePurchaser } from "./staff-alert-recipients";

// The reported Chef's Depot case: Tim is on the staff list AND placed the order.
const staffList = [
  "stevemills78@gmail.com",
  "tim@industrykitchens.com.au",
  "cs@chefsdepot.com.au",
];

test("drops the purchaser so one order sends one email to them", () => {
  assert.deepEqual(excludePurchaser(staffList, "tim@industrykitchens.com.au"), [
    "stevemills78@gmail.com",
    "cs@chefsdepot.com.au",
  ]);
});

test("leaves the rest of the staff list untouched", () => {
  assert.deepEqual(excludePurchaser(staffList, "someone-else@example.com"), staffList);
});

test("matches regardless of case or surrounding whitespace", () => {
  assert.deepEqual(excludePurchaser([" Tim@IndustryKitchens.com.au "], "tim@industrykitchens.com.au"), []);
  assert.deepEqual(excludePurchaser(["tim@industrykitchens.com.au"], "  TIM@INDUSTRYKITCHENS.COM.AU  "), []);
});

test("keeps the full list when the checkout has no email", () => {
  assert.deepEqual(excludePurchaser(staffList, null), staffList);
  assert.deepEqual(excludePurchaser(staffList, undefined), staffList);
  assert.deepEqual(excludePurchaser(staffList, "   "), staffList);
});

test("removes every copy when the purchaser is listed more than once", () => {
  assert.deepEqual(
    excludePurchaser(
      ["a@b.com", "tim@industrykitchens.com.au", "TIM@industrykitchens.com.au"],
      "tim@industrykitchens.com.au"
    ),
    ["a@b.com"]
  );
});

test("returns an empty list when the purchaser is the only recipient", () => {
  assert.deepEqual(excludePurchaser(["tim@industrykitchens.com.au"], "tim@industrykitchens.com.au"), []);
});

test("preserves the original order and casing of the addresses it keeps", () => {
  assert.deepEqual(
    excludePurchaser(["Zoe@B.com", "tim@industrykitchens.com.au", "Al@C.com"], "tim@industrykitchens.com.au"),
    ["Zoe@B.com", "Al@C.com"]
  );
});
