import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  orderStatusChipClass,
  orderTaxFactor,
  gstInclusiveAmount,
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
  paymentMethodFamily,
  isCardMethod,
  isBankTransferMethod,
  isNetTermsMethod,
  resolvePaymentMethodConfig,
  outstandingGuidance,
} from "./order-presentation.ts";
import { isUnpayableOrderStatus } from "./pay-balance.ts";

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
  // An id we do not know is NOT prettified onto the screen: that fallback is how
  // "cryozonic stripe" would have reached an Industry Kitchens customer.
  assert.equal(paymentMethodLabel("some_new_gateway"), "Not recorded");
  assert.equal(paymentMethodLabel("worldpay_v2"), "Not recorded");
});

test("method label ignores a configured entry with a blank name", () => {
  assert.equal(paymentMethodLabel("stripe", [{ id: "stripe", name: "   " }]), "Card");
});

// ── Legacy Zoey / Magento method ids (Industry Kitchens) ─────────────────────
//
// The exact ids and counts on production 2026-08-15, over channel-1 orders
// carrying a contact_id — i.e. exactly what appears in a customer's own order
// history. If this list ever needs extending, extend METHOD_FAMILY with it.

const IK_LIVE_METHOD_IDS = [
  ["cryozonic_stripe", 15319, "Card"],
  ["banktransfer", 3722, "Bank transfer"],
  ["send_bill", 709, "Account (invoice)"],
  ["ewayrapid_ewayone", 348, "Card"],
  ["netterm", 247, "Account (invoice)"],
  ["free", 110, "No payment required"],
  ["paypal_standard", 22, "PayPal"],
  ["purchaseorder", 7, "Purchase order"],
  ["bank_transfer", 3, "Bank transfer"],
  ["stripe", 1, "Card"],
] as const;

test("every payment method id live on Industry Kitchens reads as plain English", () => {
  for (const [id, , expected] of IK_LIVE_METHOD_IDS) {
    assert.equal(paymentMethodLabel(id, []), expected, id);
  }
});

test("no gateway id is prettified onto the screen", () => {
  // The ids that are plumbing rather than English. `bank_transfer` is left out
  // on purpose: its label IS "Bank transfer", which is the right answer, not a
  // leak — the test is about the prettify fallback, not about the spelling.
  const plumbing = [
    "cryozonic_stripe",
    "ewayrapid_ewayone",
    "banktransfer",
    "netterm",
    "send_bill",
    "purchaseorder",
    "paypal_standard",
  ];
  for (const id of plumbing) {
    const label = paymentMethodLabel(id, []);
    assert.ok(!label.includes("_"), `${id} printed an underscore`);
    assert.notEqual(label.toLowerCase(), id.replace(/_/g, " "), `${id} printed itself`);
  }
});

test("the configured name still wins on an exact id, and only on an exact id", () => {
  const methods = [{ id: "net_terms", name: "Net Terms" }];
  assert.equal(paymentMethodLabel("net_terms", methods), "Net Terms");
  // A Zoey Send Bill order is NOT relabelled with the name of a Net Terms method
  // that customer may never have been given.
  assert.equal(paymentMethodLabel("send_bill", methods), "Account (invoice)");
});

test("method families cover both spellings of the ids that drive the panels", () => {
  assert.equal(isBankTransferMethod("bank_transfer"), true);
  assert.equal(isBankTransferMethod("banktransfer"), true);
  assert.equal(isBankTransferMethod("BankTransfer"), true);
  assert.equal(isBankTransferMethod("stripe"), false);

  assert.equal(isNetTermsMethod("net_terms"), true);
  assert.equal(isNetTermsMethod("netterm"), true);
  assert.equal(isNetTermsMethod("send_bill"), true);
  assert.equal(isNetTermsMethod("send_invoice"), true);
  assert.equal(isNetTermsMethod("banktransfer"), false);

  assert.equal(isCardMethod("stripe"), true);
  assert.equal(isCardMethod("cryozonic_stripe"), true);
  assert.equal(isCardMethod("ewayrapid_ewayone"), true);
  assert.equal(isCardMethod("paypal_standard"), false);

  assert.equal(paymentMethodFamily("purchaseorder"), "purchase_order");
  assert.equal(paymentMethodFamily(null), null);
  assert.equal(paymentMethodFamily("who_knows"), null);
});

test("the channel's bank details are found through a legacy id, by family", () => {
  const methods = [
    { id: "stripe", name: "Credit/Debit Card" },
    { id: "bank_transfer", name: "Bank Transfer", bankDetails: { bsb: "083-004" } },
  ];
  assert.equal(resolvePaymentMethodConfig("banktransfer", methods)?.id, "bank_transfer");
  assert.equal(resolvePaymentMethodConfig("bank_transfer", methods)?.id, "bank_transfer");
  assert.equal(resolvePaymentMethodConfig("cryozonic_stripe", methods)?.id, "stripe");
  assert.equal(resolvePaymentMethodConfig("purchaseorder", methods), undefined);
  assert.equal(resolvePaymentMethodConfig(null, methods), undefined);
});

// ── outstandingGuidance ──────────────────────────────────────────────────────

test("a balance still owing always carries something telling the customer what to do", () => {
  for (const [id] of IK_LIVE_METHOD_IDS) {
    const guidance = outstandingGuidance({
      methodId: id,
      orderPayable: true,
      owed: 23873.26,
      explainedElsewhere: false,
    });
    assert.ok(guidance !== null, `${id} left an outstanding balance unexplained`);
  }
  // Including an order whose method was never recorded at all.
  assert.equal(
    outstandingGuidance({
      methodId: null,
      orderPayable: true,
      owed: 10,
      explainedElsewhere: false,
    }),
    "contact_us"
  );
});

test("guidance names the right block for each family", () => {
  assert.equal(
    outstandingGuidance({
      methodId: "banktransfer",
      orderPayable: true,
      owed: 10,
      explainedElsewhere: false,
    }),
    "bank_transfer"
  );
  assert.equal(
    outstandingGuidance({
      methodId: "netterm",
      orderPayable: true,
      owed: 10,
      explainedElsewhere: false,
    }),
    "net_terms"
  );
  assert.equal(
    outstandingGuidance({
      methodId: "purchaseorder",
      orderPayable: true,
      owed: 10,
      explainedElsewhere: false,
    }),
    "contact_us"
  );
});

test("a cancelled or refunded order is never asked to pay, whatever its figures say", () => {
  // Industry Kitchens carries cancelled orders with six- and seven-figure
  // balances still on the row (prod: order 28083, $25,242,800 "canceled" and
  // "unpaid"). Neither the bank details, the account-terms wording nor the
  // contact-us sentence may appear on one.
  for (const status of ["canceled", "cancelled", "refunded", "declined", "refund_in_progress"]) {
    for (const methodId of ["banktransfer", "netterm", "purchaseorder", "bank_transfer"]) {
      assert.equal(
        outstandingGuidance({
          methodId,
          orderPayable: !isUnpayableOrderStatus(status),
          owed: 25242800,
          explainedElsewhere: false,
        }),
        null,
        `${status} / ${methodId}`
      );
    }
  }
});

test("an account order states its terms even when nothing is owing", () => {
  assert.equal(
    outstandingGuidance({
      methodId: "net_terms",
      orderPayable: true,
      owed: 0,
      explainedElsewhere: false,
    }),
    "net_terms"
  );
});

test("a settled order is told nothing, and a pay control is not talked over", () => {
  assert.equal(
    outstandingGuidance({
      methodId: "cryozonic_stripe",
      orderPayable: true,
      owed: 0,
      explainedElsewhere: false,
    }),
    null
  );
  // The Pay-by-card button (or its refusal sentence) is already the answer.
  assert.equal(
    outstandingGuidance({
      methodId: "stripe",
      orderPayable: true,
      owed: 100,
      explainedElsewhere: true,
    }),
    null
  );
  // …but bank details are still repeated beside it, as they always were on CD.
  assert.equal(
    outstandingGuidance({
      methodId: "bank_transfer",
      orderPayable: true,
      owed: 100,
      explainedElsewhere: true,
    }),
    "bank_transfer"
  );
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

test("payment status reads in customer language for every value on channel 1", () => {
  // Zoey's own two, live on 1,078 Industry Kitchens orders (prod 2026-08-15).
  assert.equal(paymentStatusLabel("unpaid"), "Awaiting payment");
  assert.equal(paymentStatusLabel("refund_in_progress"), "Refund in progress");
  assert.equal(paymentStatusLabel("paid"), "Paid");
  assert.equal(paymentStatusLabel("refunded"), "Refunded");
  assert.equal(paymentStatusLabel("partially_paid"), "Part paid");
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

// ── orderTaxFactor / gstInclusiveAmount ──────────────────────────────────────
//
// The order page is GST-INCLUSIVE throughout (card Roy0kIEz). These two decide
// what "inclusive" means for a figure whose stored columns disagree with reality —
// which, on Industry Kitchens' fifteen years of Zoey orders, is every line.

test("the tax factor is the order's own rate, read from its subtotal", () => {
  assert.equal(orderTaxFactor({ subtotalExTax: 87, subtotalIncTax: 95.7 }), 1.1);
});

test("an order with no GST on its goods is quoted as stored, never scaled", () => {
  // Real order 1806 on channel 1: $300 of GST-free goods plus $25 freight; the
  // whole $2.50 of tax is the freight's. Inventing 10% on the goods would add $30.
  assert.equal(orderTaxFactor({ subtotalExTax: 300, subtotalIncTax: 300 }), 1);
  assert.equal(
    gstInclusiveAmount({ exTax: 300, incTax: 300, taxFactor: 1 }),
    300
  );
});

test("the tax factor answers 1 when the columns cannot tell us", () => {
  // A freight-only order (subtotal zero), and junk.
  assert.equal(orderTaxFactor({ subtotalExTax: 0, subtotalIncTax: 0 }), 1);
  assert.equal(orderTaxFactor({ subtotalExTax: NaN, subtotalIncTax: 110 }), 1);
  // Never below 1: an inclusive column BELOW the exclusive one cannot mean tax.
  assert.equal(orderTaxFactor({ subtotalExTax: 100, subtotalIncTax: 90 }), 1);
});

test("a figure that recorded its own GST is taken exactly as stored", () => {
  // Chefs Depot, order 148836: every column written by our own checkout.
  assert.equal(
    gstInclusiveAmount({ exTax: 612.7273, incTax: 674, taxFactor: 1.1 }),
    674
  );
});

test("a Zoey line that stores the same figure twice is quoted at the order's rate", () => {
  // Real order 148945 on channel 1: the line holds $87.00 in BOTH columns, while
  // the order's subtotal columns say 87.00 / 95.70. Printing the stored "inc"
  // figure would put $87.00 lines under a $95.70 subtotal.
  const taxFactor = orderTaxFactor({ subtotalExTax: 87, subtotalIncTax: 95.7 });
  assert.ok(
    Math.abs(gstInclusiveAmount({ exTax: 87, incTax: 87, taxFactor }) - 95.7) < 0.005
  );
});

test("scaled lines still sum to the order's own subtotal", () => {
  // Two lines, 250.80 ex between them (real order 148824 shape).
  const taxFactor = orderTaxFactor({ subtotalExTax: 250.8, subtotalIncTax: 275.88 });
  const lines = [102.6, 148.2].map((exTax) =>
    gstInclusiveAmount({ exTax, incTax: exTax, taxFactor })
  );
  assert.ok(Math.abs(lines.reduce((a, b) => a + b, 0) - 275.88) < 0.005);
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
    totalIncTax: 121,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery"]
  );
  assert.deepEqual(
    rows.map((r) => r.amount),
    [110, 11]
  );
});

test("every row is the GST-INCLUSIVE figure, never the exclusive one", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110,
    shippingExTax: 10,
    shippingIncTax: 11,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalIncTax: 121,
  });
  for (const row of rows) {
    assert.notEqual(row.amount, 100, "the ex-GST subtotal must never be rendered");
    assert.notEqual(row.amount, 10, "the ex-GST delivery must never be rendered");
  }
});

test("a Zoey-imported order reconciles on the inclusive basis with no adjustment", () => {
  // Real order 148945 on channel 1: subtotal and delivery carry their GST, the
  // total holds the INCLUSIVE figure in both of its columns. On the ex-GST basis
  // this order could never add up ($87 + $30 against a $128.70 total) — which is
  // why there is only one basis now.
  const rows = orderTotalRows({
    subtotalExTax: 87,
    subtotalIncTax: 95.7,
    shippingExTax: 30,
    shippingIncTax: 33,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalIncTax: 128.7,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery"]
  );
  const sum = rows.reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(sum - 128.7) < 0.005, "the column must reach the stored total");
});

test("handling only appears when it was actually charged", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 5,
    handlingIncTax: 5.5,
    totalIncTax: 115.5,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Handling"]
  );
});

test("handling stored without its GST is still shown, at the order's rate", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 5,
    handlingIncTax: 5,
    totalIncTax: 115.5,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Handling"]
  );
  assert.ok(Math.abs(rows[2].amount - 5.5) < 0.005);
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
    totalIncTax: -1008.52,
    storeCreditAmount: 1250,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Store credit applied"]
  );
  const sum = rows.reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(sum - -1008.52) < 0.005, "the column must reach the stored total");
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
    totalIncTax: 37659.633,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Adjustment"]
  );
  assert.ok(Math.abs(rows[2].amount - -33) < 0.005);
  const sum = rows.reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(sum - 37659.633) < 0.005);
});

test("sub-cent rounding does not manufacture an adjustment row", () => {
  const rows = orderTotalRows({
    subtotalExTax: 100,
    subtotalIncTax: 110.001,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 0,
    handlingIncTax: 0,
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
