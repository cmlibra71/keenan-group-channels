import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePendingWishlistAdd, decodePendingWishlistAdd, parseAddedParam } from "./pending-add.ts";

test("a pending add round-trips", () => {
  for (const add of [
    { productId: 12, variantId: null, quantity: 1 },
    { productId: 4321, variantId: 99, quantity: 12 },
  ]) {
    const raw = encodePendingWishlistAdd(add);
    assert.ok(raw);
    assert.deepEqual(decodePendingWishlistAdd(raw), add);
  }
});

test("only exactly what we write decodes", () => {
  for (const bad of [
    "",
    "p0.v0.q1",
    "p1.v0.q0",
    "p1.v0.q10000",
    "p-1.v0.q1",
    "p1.v01.q1",
    "p1.v0.q1;admin=1",
    "p1.v0.q1.extra",
    "p99999999999.v0.q1",
    "x".repeat(100),
    null,
    42,
  ]) {
    assert.equal(decodePendingWishlistAdd(bad), null, `refuses ${String(bad)}`);
  }
  assert.equal(encodePendingWishlistAdd({ productId: 0, variantId: null, quantity: 1 }), null);
  assert.equal(encodePendingWishlistAdd({ productId: 1, variantId: null, quantity: 1.5 }), null);
  assert.equal(encodePendingWishlistAdd({ productId: 1, variantId: -3, quantity: 1 }), null);
});

test("?added= takes one positive id", () => {
  assert.equal(parseAddedParam("17"), 17);
  assert.equal(parseAddedParam(["17", "18"]), 17);
  for (const bad of [undefined, "", "0", "-1", "1.5", "17abc", "javascript:1"]) assert.equal(parseAddedParam(bad), null);
});
