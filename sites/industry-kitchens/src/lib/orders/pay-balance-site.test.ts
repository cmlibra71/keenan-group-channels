import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDER_CARD_PAYMENT_OFFERED, payBalanceDecisionForOrder, payBalanceForOrder } from "./pay-balance-site";

// The DEFAULT per-site seam — Industry Kitchens' copy is byte-identical to this
// one. It must never offer a card payment on an order: not through the order
// page's control, not through the decision the account quote page reads for its
// link's verb, and not through the flag the customer's pro-forma asks
// (card isl1uwjR; the Sh03niVC gap on sf-account-orders).

const order = {
  id: 1,
  status: "pending_payment",
  payment_status: "pending",
  account_id: null,
  total_inc_tax: "100.00",
  refunded_amount: "0",
  transactions: [],
};
const session = { contactId: 1, email: "someone@example.com" };

test("this storefront does not take a card payment on an existing order", async () => {
  assert.equal(ORDER_CARD_PAYMENT_OFFERED, false);
  const decision = await payBalanceDecisionForOrder(order, session);
  assert.equal(decision.allowed, false);
  assert.equal(decision.refusal, "card_unavailable");
  const { decision: pageDecision, panel } = await payBalanceForOrder(order, session);
  assert.equal(pageDecision.allowed, false);
  assert.equal(panel, null);
});
