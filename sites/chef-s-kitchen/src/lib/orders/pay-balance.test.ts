import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidePayBalance,
  cardPaymentAvailable,
  roleMayPayAccountOrders,
  type PayBalanceInput,
} from "./pay-balance.ts";

/** A portal-native Chefs Depot order with $154.00 owing, card on, individual shopper. */
const base: PayBalanceInput = {
  orderStatus: "pending_payment",
  orderExternalSource: null,
  orderAccountId: null,
  owed: 154,
  settled: false,
  customerPaymentMethodIds: ["bank_transfer", "stripe"],
  viewerRoleName: null,
};

test("an individual with money owing and card switched on may pay the whole balance", () => {
  const d = decidePayBalance(base);
  assert.equal(d.allowed, true);
  assert.equal(d.amount, 154);
  assert.equal(d.refusal, null);
  assert.equal(d.message, null);
});

test("the amount is the WHOLE balance, rounded to the cent — the customer never types one", () => {
  assert.equal(decidePayBalance({ ...base, owed: 154.005 }).amount, 154.01);
  assert.equal(decidePayBalance({ ...base, owed: 0.014999 }).amount, 0.01);
});

// ── Tim: "only appear when the card payment is enabled on the site" ───────────

test("no card method on offer to this customer ⇒ no button", () => {
  const d = decidePayBalance({ ...base, customerPaymentMethodIds: ["bank_transfer"] });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "card_unavailable");
  assert.equal(d.message, null, "the page already explains how to pay by transfer");
});

test("the card method is matched by id, not by position or case", () => {
  assert.equal(cardPaymentAvailable([" STRIPE "]), true);
  assert.equal(cardPaymentAvailable(["net_terms", "bank_transfer"]), false);
  assert.equal(cardPaymentAvailable([]), false);
});

// ── Tim: "all orders with money still owing" ─────────────────────────────────

test("a settled order offers nothing, even if the arithmetic says a cent", () => {
  assert.equal(decidePayBalance({ ...base, settled: true }).refusal, "nothing_owing");
});

test("a sub-cent residue is not a debt", () => {
  assert.equal(decidePayBalance({ ...base, owed: 0.004 }).refusal, "nothing_owing");
});

test("a part-paid order is payable — owing is what is owing", () => {
  const d = decidePayBalance({ ...base, orderStatus: "processing", owed: 60 });
  assert.equal(d.allowed, true);
  assert.equal(d.amount, 60);
});

test("cancelled, declined and refunded orders never take more money", () => {
  for (const status of ["cancelled", "canceled", "declined", "refunded", "refund_in_progress"]) {
    assert.equal(decidePayBalance({ ...base, orderStatus: status }).refusal, "not_payable", status);
  }
});

// ── Chris 2026-08-11: Zoey orders wait for their payment history ─────────────

test("a Zoey-imported order hides the button until its payments sync", () => {
  const d = decidePayBalance({ ...base, orderExternalSource: "zoey" });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "history_pending");
  assert.equal(d.message, null);
});

test("the Zoey check is on the source column, not on the status", () => {
  assert.equal(decidePayBalance({ ...base, orderExternalSource: "ZOEY " }).refusal, "history_pending");
  assert.equal(decidePayBalance({ ...base, orderExternalSource: "portal" }).allowed, true);
});

// ── Tim: "Manager" or "Billing" on the account ───────────────────────────────

test("a business account's order needs a Manager or Billing contact", () => {
  for (const role of ["Manager", "billing", " BILLING "]) {
    const d = decidePayBalance({ ...base, orderAccountId: 42, viewerRoleName: role });
    assert.equal(d.allowed, true, role);
  }
});

test("a Buyer on the account is refused, and told why", () => {
  const d = decidePayBalance({ ...base, orderAccountId: 42, viewerRoleName: "Buyer" });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "not_authorised");
  assert.match(d.message ?? "", /Manager or Billing/);
  assert.match(d.message ?? "", /bank transfer/, "a refusal must leave a way to pay");
});

test("an unknown or missing role on a business order is refused, never waved through", () => {
  for (const role of [null, undefined, "", "Legacy"]) {
    assert.equal(
      decidePayBalance({ ...base, orderAccountId: 42, viewerRoleName: role }).refusal,
      "not_authorised",
      String(role)
    );
  }
  assert.equal(roleMayPayAccountOrders(null), false);
});

test("an individual's own order needs no role at all", () => {
  assert.equal(decidePayBalance({ ...base, orderAccountId: null, viewerRoleName: null }).allowed, true);
});

// ── Ordering: money state is decided before permission state ─────────────────

test("a Buyer looking at a PAID account order is told nothing, not refused", () => {
  const d = decidePayBalance({
    ...base,
    orderAccountId: 42,
    viewerRoleName: "Buyer",
    settled: true,
  });
  assert.equal(d.refusal, "nothing_owing");
  assert.equal(d.message, null);
});

test("junk owed values never produce a charge", () => {
  for (const owed of [NaN, -50, Infinity]) {
    const d = decidePayBalance({ ...base, owed });
    assert.equal(d.allowed, false, String(owed));
    assert.equal(d.amount, 0, String(owed));
    assert.equal(d.refusal, "nothing_owing", String(owed));
  }
});
