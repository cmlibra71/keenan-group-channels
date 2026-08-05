import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  orderStatusChipClass,
  orderTotalRows,
  visibleTransaction,
  transactionOutcomeLabel,
  creditsFromTransactions,
  refundsFromTransactions,
  paymentPosition,
  resolveNetTermsDays,
  netTermsMessage,
  outstanding,
  isSettled,
} from "./order-presentation.ts";

// ── paymentMethodLabel ───────────────────────────────────────────────────────

test("method label prefers the channel's configured name", () => {
  const methods = [{ id: "bank_transfer", name: "Direct Deposit / EFT" }];
  assert.equal(paymentMethodLabel("bank_transfer", methods), "Direct Deposit / EFT");
});

test("method label falls back when the channel has no such method configured", () => {
  assert.equal(paymentMethodLabel("stripe", []), "Card");
  assert.equal(paymentMethodLabel("bank_transfer", []), "Bank transfer");
  assert.equal(paymentMethodLabel("net_terms", []), "Account (invoice)");
});

test("method label handles a blank / unknown method without leaking an id", () => {
  assert.equal(paymentMethodLabel(null), "Not recorded");
  assert.equal(paymentMethodLabel(""), "Not recorded");
  assert.equal(paymentMethodLabel("some_new_gateway"), "some new gateway");
});

test("method label ignores a configured entry with a blank name", () => {
  assert.equal(paymentMethodLabel("stripe", [{ id: "stripe", name: "   " }]), "Card");
});

// ── paymentStatusLabel ───────────────────────────────────────────────────────

test("payment status reads in customer language for every value on channel 2", () => {
  assert.equal(paymentStatusLabel("paid"), "Paid");
  assert.equal(paymentStatusLabel("partially_paid"), "Part paid");
  assert.equal(paymentStatusLabel("pending_payment"), "Awaiting payment");
  assert.equal(paymentStatusLabel("awaiting_payment"), "Awaiting card payment");
  assert.equal(paymentStatusLabel("net_terms"), "On account");
  assert.equal(paymentStatusLabel("failed"), "Payment failed");
  assert.equal(paymentStatusLabel("pending"), "Awaiting payment");
});

test("a blank payment status reads as awaiting payment, not blank", () => {
  assert.equal(paymentStatusLabel(null), "Awaiting payment");
  assert.equal(paymentStatusLabel(""), "Awaiting payment");
});

// ── orderStatusChipClass ─────────────────────────────────────────────────────

test("the status chip is coloured exactly as the Order History list colours it", () => {
  // Same three cases, same classes, so the chip a customer clicks and the chip
  // they land on cannot diverge while a separate card owns the wording.
  assert.equal(orderStatusChipClass("completed"), "text-accent bg-accent-subtle");
  assert.equal(orderStatusChipClass("shipped"), "bg-accent-subtle text-accent-dark");
  assert.equal(orderStatusChipClass("pending"), "bg-surface-secondary text-text-secondary");
  assert.equal(orderStatusChipClass(null), "bg-surface-secondary text-text-secondary");
});

// ── orderTotalRows ───────────────────────────────────────────────────────────

test("an ordinary order is subtotal + delivery, with no adjustment row", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110,
    shippingExTax: 10,
    shippingIncTax: 11,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalExTax: 110,
    totalIncTax: 121,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery"]
  );
});

test("handling only appears when it was actually charged", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 5,
    handlingIncTax: 5.5,
    totalExTax: 105,
    totalIncTax: 115.5,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Handling"]
  );
});

test("a store credit is named, and the rows add up to the stored total", () => {
  // Real order 141602 on channel 2: $1,250 store credit, negative total.
  const rows = orderTotalRows({
    subtotalExTax: 219.5273,
    subtotalIncTax: 241.48,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalExTax: -916.8364,
    totalIncTax: -1008.52,
    storeCreditAmount: 1250,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Store credit applied"]
  );
  const sumInc = rows.reduce((n, r) => n + r.incTax, 0);
  const sumEx = rows.reduce((n, r) => n + r.exTax, 0);
  assert.ok(Math.abs(sumInc - -1008.52) < 0.005, "inc-GST column must reach the stored total");
  assert.ok(Math.abs(sumEx - -916.8364) < 0.005, "ex-GST column must reach the stored total");
});

test("an imported order whose total omits delivery still adds up", () => {
  // Real order 141627 on channel 2: $30 delivery is charged but excluded from the total.
  const rows = orderTotalRows({
    subtotalExTax: 34236.03,
    subtotalIncTax: 37659.633,
    shippingExTax: 30,
    shippingIncTax: 33,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalExTax: 34236.03,
    totalIncTax: 37659.633,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Adjustment"]
  );
  assert.ok(Math.abs(rows[2].incTax - -33) < 0.005);
  const sumInc = rows.reduce((n, r) => n + r.incTax, 0);
  assert.ok(Math.abs(sumInc - 37659.633) < 0.005);
});

test("sub-cent rounding does not manufacture an adjustment row", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110.001,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalExTax: 100,
    totalIncTax: 110,
  });
  assert.equal(rows.length, 2);
});

// ── visibleTransaction (the data-exposure guard) ─────────────────────────────

test("visibleTransaction drops every gateway internal", () => {
  const raw = {
    id: 69,
    created_at: "2026-07-02T01:05:41.803Z",
    amount: "248.9000",
    event: "purchase",
    status: "completed",
    method: "card",
    currency_code: "AUD",
    gateway: "stripe",
    gateway_transaction_id: "pi_3Rabcdef1234567890",
    gateway_response: { secret: "raw stripe payload" },
    fraud_review: true,
    avs_result: { code: "Y" },
    cvv_result: { code: "M" },
    reference_transaction_id: 4,
    offline_reason: "something internal",
    custom_provider_field: "internal",
    uuid: "0000-1111",
    order_id: 140718,
  };

  const projected = visibleTransaction(raw);

  assert.deepEqual(Object.keys(projected).sort(), [
    "amount",
    "created_at",
    "event",
    "id",
    "status",
  ]);
  for (const forbidden of [
    "gateway",
    "gateway_transaction_id",
    "gateway_response",
    "fraud_review",
    "avs_result",
    "cvv_result",
    "reference_transaction_id",
    "offline_reason",
    "custom_provider_field",
    "uuid",
    "order_id",
    "method",
  ]) {
    assert.equal(
      forbidden in projected,
      false,
      `${forbidden} must never reach the customer`
    );
  }
  assert.equal(projected.amount, 248.9);
  assert.equal(projected.id, 69);
});

test("visibleTransaction survives a junk row without producing NaN", () => {
  const projected = visibleTransaction({ id: undefined, amount: null, created_at: 12345 });
  assert.equal(projected.amount, 0);
  assert.equal(projected.id, 0);
  assert.equal(projected.created_at, null);
  assert.equal(projected.event, "");
});

// ── transactionOutcomeLabel ──────────────────────────────────────────────────

test("transaction outcome reads as an outcome, not a status code", () => {
  assert.equal(
    transactionOutcomeLabel({ event: "purchase", status: "completed" }),
    "Payment received"
  );
  assert.equal(transactionOutcomeLabel({ event: "refund", status: "completed" }), "Refund received");
  assert.equal(transactionOutcomeLabel({ event: "purchase", status: "failed" }), "Payment failed");
  assert.equal(transactionOutcomeLabel({ event: "purchase", status: "pending" }), "Payment pending");
  assert.equal(
    transactionOutcomeLabel({ event: "authorization", status: "completed" }),
    "Authorisation received"
  );
});

// ── outstanding ──────────────────────────────────────────────────────────────

test("outstanding tolerates sub-cent rounding, exactly as the payment service does", () => {
  assert.equal(outstanding(248.9, 248.9), 0);
  assert.equal(outstanding(248.9, 248.8951), 0); // within 0.005
  // A cent short is still a cent short.
  assert.ok(Math.abs(outstanding(248.9, 248.89) - 0.01) < 1e-9);
  assert.equal(outstanding(694.5, 0), 694.5);
});

test("outstanding never goes negative when more was received than billed", () => {
  assert.equal(outstanding(100, 150), 0);
});

// ── isSettled ────────────────────────────────────────────────────────────────

test("a stored 'paid' status settles the order even with an empty ledger", () => {
  // Zoey-imported orders carry payment_status 'paid' and zero transactions.
  assert.equal(isSettled("paid", outstanding(500, 0)), true);
});

test("net terms is never settled by the ledger being empty", () => {
  assert.equal(isSettled("net_terms", 0), false);
});

test("an unpaid bank transfer is not settled", () => {
  assert.equal(isSettled("pending_payment", outstanding(694.5, 0)), false);
});

test("a fully covered ledger settles an order whose status is still pending", () => {
  const rows = [{ event: "purchase", status: "completed", amount: "694.50" }];
  assert.equal(
    isSettled("pending", outstanding(694.5, creditsFromTransactions(rows))),
    true
  );
});

// ── credits / refunds ────────────────────────────────────────────────────────

test("credits and refunds are counted separately, ignoring incomplete rows", () => {
  const rows = [
    { event: "purchase", status: "completed", amount: "100.00" },
    { event: "purchase", status: "failed", amount: "999.00" },
    { event: "refund", status: "completed", amount: "25.00" },
    { event: "refund", status: "pending", amount: "10.00" },
  ];
  assert.equal(creditsFromTransactions(rows), 100);
  assert.equal(refundsFromTransactions(rows), 25);
});

test("a refund stored as a negative amount still reads as money returned", () => {
  assert.equal(refundsFromTransactions([{ event: "refund", status: "completed", amount: "-25.00" }]), 25);
});

// ── paymentPosition ──────────────────────────────────────────────────────────

test("an unpaid bank transfer owes the whole total", () => {
  const p = paymentPosition({
    paymentStatus: "pending_payment",
    totalIncTax: 694.5,
    transactions: [],
  });
  assert.deepEqual(p, { paid: 0, refunded: 0, owed: 694.5, settled: false });
});

test("a paid card order reads paid in full from its ledger", () => {
  const p = paymentPosition({
    paymentStatus: "paid",
    totalIncTax: 248.9,
    transactions: [{ event: "purchase", status: "completed", amount: "248.90" }],
  });
  assert.deepEqual(p, { paid: 248.9, refunded: 0, owed: 0, settled: true });
});

test("a Zoey-imported order marked paid with no ledger still reads paid in full", () => {
  const p = paymentPosition({ paymentStatus: "paid", totalIncTax: 500, transactions: [] });
  assert.equal(p.paid, 500);
  assert.equal(p.owed, 0);
});

test("a fully refunded order shows nothing paid and nothing owing", () => {
  // The bug this replaces: net-zero ledger + 'refunded' status reported the full
  // total as money the customer had paid.
  const p = paymentPosition({
    paymentStatus: "refunded",
    totalIncTax: 100,
    transactions: [
      { event: "purchase", status: "completed", amount: "100.00" },
      { event: "refund", status: "completed", amount: "100.00" },
    ],
  });
  assert.deepEqual(p, { paid: 0, refunded: 100, owed: 0, settled: true });
});

test("a refund recorded only on the order (no ledger row) still reduces what was paid", () => {
  const p = paymentPosition({
    paymentStatus: "partially_refunded",
    totalIncTax: 100,
    refundedAmount: 30,
    transactions: [{ event: "purchase", status: "completed", amount: "100.00" }],
  });
  assert.equal(p.paid, 70);
  assert.equal(p.refunded, 30);
  // $30 came back, so $70 was due and $70 was paid — nothing is outstanding.
  assert.equal(p.owed, 0);
});

test("a refund in BOTH records is one refund, not two", () => {
  const p = paymentPosition({
    paymentStatus: "partially_refunded",
    totalIncTax: 100,
    refundedAmount: 30,
    transactions: [
      { event: "purchase", status: "completed", amount: "100.00" },
      { event: "refund", status: "completed", amount: "30.00" },
    ],
  });
  assert.equal(p.refunded, 30);
  assert.equal(p.paid, 70);
});

test("a refunded order with neither a ledger nor a refunded amount still shows $0 paid", () => {
  const p = paymentPosition({ paymentStatus: "refunded", totalIncTax: 100, transactions: [] });
  assert.deepEqual(p, { paid: 0, refunded: 100, owed: 0, settled: true });
});

test("a part payment leaves the balance outstanding", () => {
  const p = paymentPosition({
    paymentStatus: "partially_paid",
    totalIncTax: 1000,
    transactions: [{ event: "purchase", status: "completed", amount: "400.00" }],
  });
  assert.equal(p.paid, 400);
  assert.equal(p.owed, 600);
  assert.equal(p.settled, false);
});

test("a net-terms order owes the total until it is paid", () => {
  const p = paymentPosition({ paymentStatus: "net_terms", totalIncTax: 8360, transactions: [] });
  assert.equal(p.owed, 8360);
  assert.equal(p.settled, false);
});

// ── resolveNetTermsDays (never invent a commercial term) ─────────────────────

test("the term stamped on the order wins", () => {
  assert.equal(resolveNetTermsDays(14, 30, 60), 14);
});

test("the account's agreed term is used when the order carries none", () => {
  assert.equal(resolveNetTermsDays(null, 30, undefined), 30);
});

test("the channel default is the last resort", () => {
  assert.equal(resolveNetTermsDays(null, null, 45), 45);
});

test("the net-terms sentence names a term only when one was agreed", () => {
  assert.equal(
    netTermsMessage(14),
    "This order is on your account with Net 14 payment terms. An invoice will be issued for it — no action is required here."
  );
  const noTerm = netTermsMessage(null, "INV-1042");
  assert.ok(!/Net\s*\d/.test(noTerm), "must never quote a term nobody agreed");
  assert.ok(noTerm.includes("agreed payment terms"));
  assert.ok(noTerm.includes("(INV-1042)"));
});

test("no term anywhere means NO number — never a made-up 30", () => {
  // Channel 2 configures no net-terms default and most net-terms orders carry
  // none either; quoting "Net 30" there would state a term nobody agreed.
  assert.equal(resolveNetTermsDays(null, null, null), null);
  assert.equal(resolveNetTermsDays(undefined, undefined, undefined), null);
  // 0 on accounts.net_terms_days means "not set", not "due immediately".
  assert.equal(resolveNetTermsDays(0, 0, 0), null);
});
