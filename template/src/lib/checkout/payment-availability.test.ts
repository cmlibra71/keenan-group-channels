import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePaymentAvailability,
  PAY_UNAVAILABLE_ACCOUNT_ORDER,
  PAY_UNAVAILABLE_ACCOUNT_QUOTE,
} from "./payment-availability.ts";

test("a shopper with at least one offerable method is available, whatever the store has", () => {
  assert.equal(resolvePaymentAvailability(3, 1), "available");
  assert.equal(resolvePaymentAvailability(1, 1), "available");
});

test("no methods on the channel at all is the store-unconfigured state, not the account one", () => {
  // Register rule (payment-methods, recorded before card N8kE8arY): this state
  // keeps its old wording and Place Order still works.
  assert.equal(resolvePaymentAvailability(0, 0), "store-unconfigured");
});

test("the store has methods but the account may use none of them", () => {
  // Chefs Depot: one enabled method (bank transfer). Mark it Staff only on an
  // account and this is the ONLY outcome the feature can produce there.
  assert.equal(resolvePaymentAvailability(1, 0), "account-restricted");
  assert.equal(resolvePaymentAvailability(3, 0), "account-restricted");
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
