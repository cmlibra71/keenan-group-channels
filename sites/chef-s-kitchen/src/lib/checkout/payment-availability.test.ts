import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePaymentAvailability,
  PAY_UNAVAILABLE_ACCOUNT_ORDER,
  PAY_UNAVAILABLE_ACCOUNT_QUOTE,
} from "./payment-availability.ts";

test("a shopper with at least one offerable method is available, whatever the store has", () => {
  assert.equal(resolvePaymentAvailability(3, 1, true), "available");
  assert.equal(resolvePaymentAvailability(1, 1, true), "available");
  assert.equal(resolvePaymentAvailability(1, 1, false), "available");
});

test("no methods on the channel at all is the store-unconfigured state, not the account one", () => {
  // Register rule (payment-methods, recorded before card N8kE8arY): this state
  // keeps its old wording and Place Order still works.
  assert.equal(resolvePaymentAvailability(0, 0, true), "store-unconfigured");
  assert.equal(resolvePaymentAvailability(0, 0, false), "store-unconfigured");
});

test("the store has methods but the account may use none of them", () => {
  // Chefs Depot: one enabled method (bank transfer). Mark it Staff only on an
  // account and this is the ONLY outcome the feature can produce there.
  assert.equal(resolvePaymentAvailability(1, 0, true), "account-restricted");
  assert.equal(resolvePaymentAvailability(3, 0, true), "account-restricted");
});

test("a GUEST is never told their account is restricted — they have not got one", () => {
  // Reachable if a channel's only customer-facing method were account-gated
  // (net terms) or above the finance floor: the guest loses every option, but
  // nothing about their account did it. Blaming an account they do not have
  // sends them to ring a sales desk that cannot help, so they fall to the
  // store state and the order is placed unpaid, as it always was.
  assert.equal(resolvePaymentAvailability(1, 0, false), "store-unconfigured");
  assert.equal(resolvePaymentAvailability(3, 0, false), "store-unconfigured");
});

test("both customer surfaces say the same thing, differing only in order/quote", () => {
  const shared = "Online payment isn't available on your account — please contact us to arrange payment for this ";
  assert.equal(PAY_UNAVAILABLE_ACCOUNT_ORDER, `${shared}order.`);
  assert.equal(PAY_UNAVAILABLE_ACCOUNT_QUOTE, `${shared}quote.`);
  // No internal vocabulary on a customer surface.
  for (const msg of [PAY_UNAVAILABLE_ACCOUNT_ORDER, PAY_UNAVAILABLE_ACCOUNT_QUOTE]) {
    assert.equal(/staff|admin|payment status|pending|configur/i.test(msg), false);
  }
});
