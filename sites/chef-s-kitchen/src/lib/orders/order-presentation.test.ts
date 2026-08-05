import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  orderStatusLabel,
  visibleTransaction,
  transactionOutcomeLabel,
  paidFromTransactions,
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

// ── orderStatusLabel ─────────────────────────────────────────────────────────

test("order status reads in plain words", () => {
  assert.equal(orderStatusLabel("pending"), "Received");
  assert.equal(orderStatusLabel("processing"), "Being prepared");
  assert.equal(orderStatusLabel("completed"), "Completed");
  assert.equal(orderStatusLabel("cancelled"), "Cancelled");
  assert.equal(orderStatusLabel("refund_in_progress"), "Refund in progress");
  assert.equal(orderStatusLabel(null), "Received");
  assert.equal(orderStatusLabel("some_future_status"), "some future status");
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

// ── paidFromTransactions / outstanding ───────────────────────────────────────

test("paid sums completed transactions and negates refunds", () => {
  const rows = [
    { event: "purchase", status: "completed", amount: "100.00" },
    { event: "purchase", status: "completed", amount: "50.00" },
    { event: "refund", status: "completed", amount: "25.00" },
  ];
  assert.equal(paidFromTransactions(rows), 125);
});

test("paid ignores anything that did not complete", () => {
  const rows = [
    { event: "purchase", status: "failed", amount: "100.00" },
    { event: "purchase", status: "pending", amount: "40.00" },
    { event: "authorization", status: "completed", amount: "10.00" },
  ];
  assert.equal(paidFromTransactions(rows), 10);
});

test("paid is zero with no ledger at all (a Zoey-imported order)", () => {
  assert.equal(paidFromTransactions([]), 0);
});

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
  assert.equal(isSettled("paid", outstanding(500, paidFromTransactions([]))), true);
});

test("net terms is never settled by the ledger being empty", () => {
  assert.equal(isSettled("net_terms", 0), false);
});

test("an unpaid bank transfer is not settled", () => {
  assert.equal(isSettled("pending_payment", outstanding(694.5, 0)), false);
});

test("a fully covered ledger settles an order whose status is still pending", () => {
  const rows = [{ event: "purchase", status: "completed", amount: "694.50" }];
  assert.equal(isSettled("pending", outstanding(694.5, paidFromTransactions(rows))), true);
});
