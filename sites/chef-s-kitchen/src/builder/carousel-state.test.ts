import { test } from "node:test";
import assert from "node:assert/strict";
import { autoplayMs, nearestIndex, stepIndex } from "./carousel-state.ts";

test("stepIndex wraps when looping, clamps otherwise", () => {
  assert.equal(stepIndex(4, 5, 1, true), 0);
  assert.equal(stepIndex(0, 5, -1, true), 4);
  assert.equal(stepIndex(4, 5, 1, false), 4);
  assert.equal(stepIndex(0, 5, -1, false), 0);
  assert.equal(stepIndex(2, 5, 1, true), 3);
  assert.equal(stepIndex(0, 0, 1, true), 0);
});

test("nearestIndex picks the slide whose left edge is nearest", () => {
  assert.equal(nearestIndex([0, 300, 600], 0), 0);
  assert.equal(nearestIndex([0, 300, 600], 290), 1);
  assert.equal(nearestIndex([0, 300, 600], 999), 2);
  assert.equal(nearestIndex([], 50), 0);
});

test("autoplayMs: empty/invalid = off; clamped to 1.5–60 s", () => {
  assert.equal(autoplayMs(null), 0);
  assert.equal(autoplayMs(""), 0);
  assert.equal(autoplayMs("abc"), 0);
  assert.equal(autoplayMs("0"), 0);
  assert.equal(autoplayMs("5000"), 5000);
  assert.equal(autoplayMs("100"), 1500);
  assert.equal(autoplayMs("999999"), 60000);
});
