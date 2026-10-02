import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOpenOrderReuse, intentBlocksReuse, EARLIER_PAYMENT_IN_PROGRESS_MESSAGE } from "./open-order-reuse";

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

test("money already moving blocks a claim / refresh: succeeded, processing, requires_capture", () => {
  for (const s of ["succeeded", "processing", "requires_capture"]) assert.equal(intentBlocksReuse(s), true, s);
  for (const s of ["requires_payment_method", "requires_confirmation", "requires_action", "canceled", null, undefined])
    assert.equal(intentBlocksReuse(s as string | null | undefined), false, String(s));
});

test("placeOrder reads the intent BEFORE claiming or refreshing a reused order, and refuses when money is moving", () => {
  const src = readFileSync(
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"),
    "utf8"
  );
  const decide = src.indexOf("decideOpenOrderReuse(openForCart.total_inc_tax, totalIncTax)");
  const status = src.indexOf("getStripePaymentIntentStatus(existing.id, existing.payment_provider_id)");
  const block = src.indexOf("if (intentBlocksReuse(intentStatus))", status);
  const refuse = src.indexOf("return { error: EARLIER_PAYMENT_IN_PROGRESS_MESSAGE }", block);
  const po = src.indexOf("customerPo: customerReference", block);
  const billing = src.indexOf("billingAddress,", block);
  const claim = src.indexOf("session?.contactId && existing.contact_id !== session.contactId");
  const intent = src.indexOf("paymentService.createStripePaymentIntent(existing.id");
  for (const [n, i] of Object.entries({ decide, status, block, refuse, po, billing, claim, intent })) {
    assert.notEqual(i, -1, `${n} not found — this guard needs rewriting`);
  }
  assert.ok(decide < status && status < block && block < refuse && refuse < po && po < billing && billing < claim && claim < intent);
});

test("a guest retry re-links the order's person from the (possibly corrected) billing email, as a fresh order does", () => {
  const src = readFileSync(
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"),
    "utf8"
  );
  const reuse = src.slice(src.indexOf("MONEY ALREADY MOVING?"), src.indexOf("paymentService.createStripePaymentIntent(existing.id"));
  assert.match(reuse, /session\?\.contactId\s*\?\s*undefined\s*:\s*\(\(await resolveStampableOrderContactId\(\{ email, channelId: CHANNEL_ID, accountId: null \}\)\)/);
  assert.match(reuse, /createGuestContactForCheckout\(\{ email, firstName, lastName, phone \}\)/);
  assert.match(reuse, /contactId: guestContactId/);
});

test("any failure in the reuse step refuses — it never falls through to writing a second order", () => {
  const src = readFileSync(
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"),
    "utf8"
  );
  const branch = src.indexOf('if (effectivePaymentMethod === "stripe") {\n    try {');
  const lookup = src.indexOf("findOpenCardOrderForCart(uuid", branch);
  const catchAt = src.indexOf("} catch (e) {", src.indexOf("paymentService.createStripePaymentIntent(existing.id", lookup));
  const refuse = src.indexOf("return { error: OPEN_ORDER_CHECK_FAILED_MESSAGE };", catchAt);
  const create = src.indexOf("const order = await orderService.create({", lookup);
  for (const [n, i] of Object.entries({ branch, lookup, catchAt, refuse, create })) assert.notEqual(i, -1, `${n} not found`);
  // The catch that closes the reuse branch returns before the fresh order is written.
  assert.ok(lookup < catchAt && catchAt < refuse && refuse < create);
  assert.doesNotMatch(src.slice(catchAt, refuse), /non-fatal/);
});
