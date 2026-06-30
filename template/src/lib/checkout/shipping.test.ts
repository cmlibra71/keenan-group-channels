import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifiesForFreeDelivery, DEFAULT_FREE_DELIVERY_THRESHOLD } from "./shipping.ts";

const q = (over: Partial<Parameters<typeof qualifiesForFreeDelivery>[0]>) =>
  qualifiesForFreeDelivery({ enabled: true, isMember: true, amount: 600, threshold: 500, ...over });

test("qualifies when enabled, member, and at/over threshold", () => {
  assert.equal(q({}), true);
  assert.equal(q({ amount: 500 }), true); // boundary is inclusive (>=)
});

test("does not qualify when disabled", () => {
  assert.equal(q({ enabled: false }), false);
});

test("does not qualify for non-members", () => {
  assert.equal(q({ isMember: false }), false);
});

test("does not qualify below threshold", () => {
  assert.equal(q({ amount: 499.99 }), false);
});

test("default threshold constant is 500", () => {
  assert.equal(DEFAULT_FREE_DELIVERY_THRESHOLD, 500);
});
