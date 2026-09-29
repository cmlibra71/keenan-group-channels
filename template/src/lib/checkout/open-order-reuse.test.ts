import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOpenOrderReuse, EARLIER_PAYMENT_IN_PROGRESS_MESSAGE } from "./open-order-reuse";

test("same total to the cent → reuse the open order (double-press / network retry)", () => {
  assert.equal(decideOpenOrderReuse("7548.7500", 7548.75), "reuse");
  assert.equal(decideOpenOrderReuse(7548.75, 7548.749), "reuse");
});

test("cart re-priced LOWER since the first attempt → replace (never keep the dearer lines)", () => {
  // Guest re-priced to Wholesale after signing in: 6862.50 → 6313.50 ex GST.
  assert.equal(decideOpenOrderReuse("7548.75", 6944.85), "replace");
});

test("cart re-priced HIGHER since the first attempt → replace (never charge more than the lines say)", () => {
  // LUUS-CS-12C guest: product special 6588 → NOT LOGGED IN list 6862.50 ex GST.
  assert.equal(decideOpenOrderReuse("7246.80", 7548.75), "replace");
  assert.equal(decideOpenOrderReuse("7548.74", 7548.75), "replace");
});

test("an unreadable open total is replaced, never trusted", () => {
  assert.equal(decideOpenOrderReuse(null, 10), "replace");
  assert.equal(decideOpenOrderReuse("abc", 10), "replace");
  assert.match(EARLIER_PAYMENT_IN_PROGRESS_MESSAGE, /still being processed/);
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("placeOrder reuses only on the decision, and cancels the stale intent before the stale order", () => {
  const src = readFileSync(
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"),
    "utf8"
  );
  const decide = src.indexOf("decideOpenOrderReuse(openForCart.total_inc_tax, totalIncTax)");
  const voidIntent = src.indexOf(".voidPayment(openForCart.id");
  const refuse = src.indexOf("return { error: EARLIER_PAYMENT_IN_PROGRESS_MESSAGE }");
  const cancel = src.indexOf('status: "canceled"', voidIntent);
  const reuse = src.indexOf("paymentService.createStripePaymentIntent(existing.id");
  const create = src.indexOf("orderService.create({", reuse);
  for (const [name, i] of Object.entries({ decide, voidIntent, refuse, cancel, reuse, create })) {
    assert.notEqual(i, -1, `${name} not found — this guard needs rewriting`);
  }
  assert.ok(decide < voidIntent && voidIntent < refuse && refuse < cancel && cancel < reuse && reuse < create);
});
