import { test } from "node:test";
import assert from "node:assert/strict";
import { tileQuantity } from "./tile-quantity.ts";

test("a typed whole number is the quantity (the box's value arrives as text)", () => {
  assert.equal(tileQuantity("3"), 3);
  assert.equal(tileQuantity(12), 12);
});

test("absent, blank, zero, negative, fractional or text adds one — exactly as before the box", () => {
  for (const v of [undefined, null, "", "  ", "0", -2, 1.5, "abc"]) assert.equal(tileQuantity(v), 1);
});

test("capped at 10,000", () => {
  assert.equal(tileQuantity("999999"), 10000);
});
