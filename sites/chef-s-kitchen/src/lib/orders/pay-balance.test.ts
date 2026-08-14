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
  orderIsTestMode: false,
  orderAccountId: null,
  owed: 154,
  settled: false,
  customerPaymentMethodIds: ["bank_transfer", "stripe"],
  viewerIsAccountMember: false,
  viewerRoleName: null,
  viewerRoleUnknown: false,
};

/** The same order, viewed by somebody who belongs to a business account. */
const member = (roleName: string | null): PayBalanceInput => ({
  ...base,
  viewerIsAccountMember: true,
  viewerRoleName: roleName,
});

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

// ── Test-mode orders never reach the LIVE gateway ────────────────────────────
//
// The E2E test checkout stamps `metafields.test_mode = true` on orders placed
// while the channel runs Stripe in TEST mode. Their totals are fake, but their
// ledger reads unpaid — and pay-balance always charges the LIVE gateway. Release
// review held the wave on exactly this: a test order was being offered a real
// charge for its full fake total.

test("a test-mode order is refused before any gateway work, and told to contact us", () => {
  const d = decidePayBalance({ ...base, orderIsTestMode: true });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "test_order");
  assert.equal(d.message, "This order cannot be paid online. Contact us and we will sort it out.");
});

test("a test-mode order is refused even when card payment is not on offer at all", () => {
  // Refused ahead of the card-availability question: the decision must never
  // depend on gateway state for an order whose money is not real.
  const d = decidePayBalance({ ...base, orderIsTestMode: true, customerPaymentMethodIds: [] });
  assert.equal(d.refusal, "test_order");
});

test("a SETTLED test-mode order still reads nothing owing — money state first", () => {
  const d = decidePayBalance({ ...base, orderIsTestMode: true, settled: true });
  assert.equal(d.refusal, "nothing_owing");
  assert.equal(d.message, null);
});

test("orders without the marker are unaffected", () => {
  assert.equal(decidePayBalance({ ...base, orderIsTestMode: false }).allowed, true);
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

// ── The gate reads the VIEWER, not `orders.account_id` ───────────────────────
//
// Checkout stamps `account_id` only on a NET-TERMS order, so a business
// account's card and bank-transfer orders carry NULL — 22 of the 32 live Chefs
// Depot orders placed by account members (prod, 2026-08-14). A rule that asked
// the column took the "individual, no role needed" branch on all of them, which
// is the whole of Tim's restriction failing open on the majority of the orders
// it exists for. These are the cases that catch it coming back.

test("a Buyer is refused on their OWN order when the order carries no account_id", () => {
  const d = decidePayBalance({ ...member("Buyer"), orderAccountId: null });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "not_authorised");
  assert.match(d.message ?? "", /Manager or Billing/);
});

test("a Manager is allowed on the same account_id-less order", () => {
  assert.equal(decidePayBalance({ ...member("Manager"), orderAccountId: null }).allowed, true);
  assert.equal(decidePayBalance({ ...member("Billing"), orderAccountId: null }).allowed, true);
});

test("an account member with no role at all is refused on an account_id-less order", () => {
  for (const role of [null, "", "Restricted Buyer"]) {
    assert.equal(
      decidePayBalance({ ...member(role), orderAccountId: null }).refusal,
      "not_authorised",
      String(role)
    );
  }
});

test("belonging to no account keeps the individual path open", () => {
  const d = decidePayBalance({ ...base, viewerIsAccountMember: false, orderAccountId: null });
  assert.equal(d.allowed, true, "most of Chefs Depot has no business account");
});

// ── A role lookup that failed refuses; it never guesses ──────────────────────

test("an unreadable role refuses the payment and says so", () => {
  const d = decidePayBalance({ ...base, viewerRoleUnknown: true });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "role_unknown");
  assert.match(d.message ?? "", /bank transfer/, "a refusal must leave a way to pay");
});

test("an unreadable role refuses even when nothing else suggests an account", () => {
  // The lookup that failed is the one that would have reported the membership,
  // so `viewerIsAccountMember` reads false here. Deferring the check behind it
  // would let exactly the orders this gate protects through.
  const d = decidePayBalance({
    ...base,
    viewerIsAccountMember: false,
    orderAccountId: null,
    viewerRoleUnknown: true,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "role_unknown");
});

test("an unreadable role on a PAID order still says nothing owing, not a permissions error", () => {
  const d = decidePayBalance({ ...base, viewerRoleUnknown: true, settled: true });
  assert.equal(d.refusal, "nothing_owing");
  assert.equal(d.message, null);
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
