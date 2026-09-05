import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  orderStatusChipClass,
  orderTaxFactor,
  orderLineBasis,
  lineSubtotalIncTax,
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

test("an order settled out of the customer's balance names it, not 'Not recorded'", () => {
  // The portal's Capture Payment screen can settle an invoice out of an account's store credit
  // (card OmIgGv2C) and stamps `store_credit` on an order that carried no method at all. Without
  // an entry here the customer's own page would read "Not recorded" while the portal read
  // "Store Credit" — two of our screens disagreeing about one record.
  assert.equal(paymentMethodLabel("store_credit", []), "Store credit");
  assert.equal(paymentMethodLabel("storecredit", []), "Store credit");
  assert.equal(paymentMethodLabel("Store_Credit", []), "Store credit");
});

test("store credit is not a family, so a balance owing still gets the contact-us sentence", () => {
  // Deliberate: spending a balance is not an arrangement to pay, so there is no bank-details or
  // account-terms block it could produce. What it must NOT do is answer "nothing".
  assert.equal(paymentMethodFamily("store_credit"), null);
  assert.equal(
    outstandingGuidance({
      methodId: "store_credit",
      orderPayable: true,
      owed: 2295,
      explainedElsewhere: false,
    }),
    "contact_us"
  );
  // Fully settled: nothing owing, so nothing to say.
  assert.equal(
    outstandingGuidance({
      methodId: "store_credit",
      orderPayable: true,
      owed: 0,
      explainedElsewhere: false,
    }),
    null
  );
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

test("the tax factor answers 1 when nothing on the order can tell us", () => {
  // No subtotal, no lines, no total: there is nothing to read a rate off.
  assert.equal(orderTaxFactor({ subtotalExTax: 0, subtotalIncTax: 0 }), 1);
  assert.equal(orderTaxFactor({ subtotalExTax: NaN, subtotalIncTax: 110 }), 1);
  // Never below 1: an inclusive column BELOW the exclusive one cannot mean tax.
  assert.equal(orderTaxFactor({ subtotalExTax: 100, subtotalIncTax: 90 }), 1);
});

// ── The 3,144 Industry Kitchens orders that stored only their total ──────────
//
// The import wrote `total_inc_tax` and left the subtotal, delivery and tax columns
// at 0 while the lines kept their EXCLUSIVE figures. Reading the rate off the
// subtotal alone answered 1 on every one of them, so the customer read ex-GST lines
// — 10% understated — under a $0.00 Subtotal, with the whole order restated
// underneath as an "Adjustment". 728 of them are reachable from a signed-in
// customer's Order History today, and they are the RECENT ones.

test("the rate is read off the order total when the subtotal columns are empty", () => {
  // Real order 148926 / PFIK_20249233: subtotal 0/0, delivery 0/0, tax 0, total
  // $1,467.88, one line of 4 x $326.11 ex = $1,304.44. 1,304.44 x 1.1 = $1,434.88,
  // and the $33.00 left over is the freight the import dropped.
  const lines = orderLineBasis([{ exTax: 1304.44, incTax: 1304.44 }]);
  const factor = orderTaxFactor({
    subtotalExTax: 0,
    subtotalIncTax: 0,
    shippingExTax: 0,
    shippingIncTax: 0,
    totalIncTax: 1467.88,
    lines,
  });
  assert.equal(factor, 1.1, "the goods carried GST and must be quoted with it");
  assert.ok(
    Math.abs(gstInclusiveAmount({ exTax: 326.11, incTax: 326.11, taxFactor: factor }) - 358.72) <
      0.005,
    "the line reads $358.72 each, not the stored $326.11"
  );
});

test("the derived rate is capped at 10% — the whole of Australian GST", () => {
  // A total 25% above the lines is freight or a fee the import dropped. Calling it
  // tax would inflate every line by 25% and hide the difference inside the goods.
  const lines = orderLineBasis([{ exTax: 100, incTax: 100 }]);
  const factor = orderTaxFactor({ subtotalExTax: 0, subtotalIncTax: 0, totalIncTax: 125, lines });
  assert.equal(factor, 1.1);
});

test("a total no bigger than the lines is no evidence of tax", () => {
  const lines = orderLineBasis([{ exTax: 2536.54, incTax: 2536.54 }]);
  // Real order 5576 / PF20241848: $2,536.54 of lines against a $48.38 total.
  assert.equal(
    orderTaxFactor({ subtotalExTax: 0, subtotalIncTax: 0, totalIncTax: 48.38, lines }),
    1
  );
});

test("a delivery that already recorded its GST is not grossed again by the derived rate", () => {
  // Lines $100 ex, delivery stored 30/33 (its own tax recorded), total $143.
  // The goods rate is (143 - 33) / 100 = 1.1, not 143/100.
  const lines = orderLineBasis([{ exTax: 100, incTax: 100 }]);
  const factor = orderTaxFactor({
    subtotalExTax: 0,
    subtotalIncTax: 0,
    shippingExTax: 30,
    shippingIncTax: 33,
    totalIncTax: 143,
    lines,
  });
  assert.equal(factor, 1.1);
});

test("orderLineBasis splits the lines that recorded their GST from the ones that did not", () => {
  const basis = orderLineBasis([
    { exTax: 612.7273, incTax: 674 }, // our own checkout
    { exTax: 87, incTax: 87 }, // Zoey
    { exTax: 30, incTax: 30 }, // Zoey
  ]);
  assert.equal(basis.fixedIncTax, 674);
  assert.equal(basis.scalableExTax, 117);
  assert.ok(Math.abs(lineSubtotalIncTax(basis, 1.1) - (674 + 128.7)) < 0.005);
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

// ── The breakdown on an order that stored no subtotal ────────────────────────

test("an order with no stored subtotal takes it from the lines, never from zero", () => {
  // Real order 148926 / PFIK_20249233 end to end.
  const rows = orderTotalRows({
    subtotalExTax: 0,
    subtotalIncTax: 0,
    shippingExTax: 0,
    shippingIncTax: 0,
    handlingExTax: 0,
    handlingIncTax: 0,
    totalIncTax: 1467.88,
    lines: orderLineBasis([{ exTax: 1304.44, incTax: 1304.44 }]),
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Subtotal", "Delivery", "Adjustment"]
  );
  assert.ok(Math.abs(rows[0].amount - 1434.88) < 0.005, "Subtotal is the lines with their GST");
  assert.ok(Math.abs(rows[2].amount - 33) < 0.005, "only the dropped freight is left over");
  const sum = rows.reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(sum - 1467.88) < 0.005, "the column must reach the stored total");
});

test("no breakdown at all where the order lists no priced line to build one from", () => {
  // 81 Industry Kitchens imports: a real total, no usable subtotal, nothing priced
  // above it. A $0.00 Subtotal over an "Adjustment" the size of the order is worse
  // than saying nothing, so the Order Total stands on its own.
  assert.deepEqual(
    orderTotalRows({
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 1467.88,
      lines: orderLineBasis([]),
    }),
    []
  );
  // …and the same when the page passes no lines at all.
  assert.deepEqual(
    orderTotalRows({
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 1467.88,
    }),
    []
  );
});

test("no breakdown where the lines are worth more than the total that was charged", () => {
  // 72 Industry Kitchens imports. Real order 5576 / PF20241848: $2,536.54 of lines
  // against a $48.38 total. Reconciling that would need a -$2,488.16 row.
  assert.deepEqual(
    orderTotalRows({
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 48.38,
      lines: orderLineBasis([{ exTax: 2536.54, incTax: 2536.54 }]),
    }),
    []
  );
});

// ── The two invariants the card promises, asserted over every shape ──────────
//
// These are the failures the card exists to remove, so they are asserted as rules
// rather than as examples: whatever the stored columns say, the customer must never
// read a $0.00 Subtotal above priced lines, and never a reconciling row the size of
// the order itself.

/**
 * Every money shape production actually holds, named by the order it came from.
 * `linesWorth` is the ex-tax value of the lines the page would list above the
 * breakdown — 0 where the order lists none.
 */
const MONEY_SHAPES: Array<{
  name: string;
  linesWorth: number;
  input: Parameters<typeof orderTotalRows>[0];
}> = [
  {
    name: "148945 PFIK_20249243 — Zoey, subtotal and delivery stored",
    linesWorth: 87,
    input: {
      subtotalExTax: 87,
      subtotalIncTax: 95.7,
      shippingExTax: 30,
      shippingIncTax: 33,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 128.7,
      lines: orderLineBasis([{ exTax: 87, incTax: 87 }]),
    },
  },
  {
    name: "1806 PF20237033-2 — GST-free goods plus taxed freight",
    linesWorth: 300,
    input: {
      subtotalExTax: 300,
      subtotalIncTax: 300,
      shippingExTax: 25,
      shippingIncTax: 27.5,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 327.5,
      lines: orderLineBasis([{ exTax: 300, incTax: 300 }]),
    },
  },
  {
    name: "146643 PFIK_20248880 — blended goods rate",
    linesWorth: 172.24,
    input: {
      subtotalExTax: 172.24,
      subtotalIncTax: 186.46,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 186.46,
      lines: orderLineBasis([
        { exTax: 30, incTax: 30 },
        { exTax: 33, incTax: 33 },
        { exTax: 30.08, incTax: 30.08 },
        { exTax: 29.16, incTax: 29.16 },
        { exTax: 50, incTax: 50 },
      ]),
    },
  },
  {
    name: "148926 PFIK_20249233 — total stored, nothing else",
    linesWorth: 1304.44,
    input: {
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 1467.88,
      lines: orderLineBasis([{ exTax: 1304.44, incTax: 1304.44 }]),
    },
  },
  {
    name: "5576 PF20241848 — lines worth more than the total charged",
    linesWorth: 2536.54,
    input: {
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 48.38,
      lines: orderLineBasis([{ exTax: 2536.54, incTax: 2536.54 }]),
    },
  },
  {
    name: "an import with a total and no priced line at all",
    linesWorth: 0,
    input: {
      subtotalExTax: 0,
      subtotalIncTax: 0,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 1467.88,
      lines: orderLineBasis([]),
    },
  },
  {
    name: "141602 ORD-MR65S0G6-V86P — store credit larger than the order",
    linesWorth: 219.5273,
    input: {
      subtotalExTax: 219.5273,
      subtotalIncTax: 241.48,
      shippingExTax: 0,
      shippingIncTax: 0,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: -1008.52,
      storeCreditAmount: 1250,
      lines: orderLineBasis([{ exTax: 219.5273, incTax: 241.48 }]),
    },
  },
  {
    name: "141627 — imported total that omits the delivery it charged",
    linesWorth: 34236.03,
    input: {
      subtotalExTax: 34236.03,
      subtotalIncTax: 37659.633,
      shippingExTax: 30,
      shippingIncTax: 33,
      handlingExTax: 0,
      handlingIncTax: 0,
      totalIncTax: 37659.633,
      lines: orderLineBasis([{ exTax: 34236.03, incTax: 34236.03 }]),
    },
  },
];

test("a $0.00 Subtotal is never printed above priced lines", () => {
  for (const shape of MONEY_SHAPES) {
    if (shape.linesWorth === 0) continue;
    const subtotal = orderTotalRows(shape.input).find((r) => r.label === "Subtotal");
    if (!subtotal) continue; // no breakdown at all is the other honest answer
    assert.ok(
      Math.abs(subtotal.amount) > 0.005,
      `${shape.name}: Subtotal $0.00 above $${shape.linesWorth} of lines`
    );
  }
});

test("a reconstructed breakdown never restates the whole order as an Adjustment", () => {
  // The rule holds where the SUBTOTAL was reconstructed from the lines, which is
  // where the reconciling row would otherwise be measuring our own guess. Where the
  // order stored its own subtotal the residual reconciles two stored facts and may
  // legitimately be large — 298 production orders were amended without their
  // subtotal being recomputed (PF20225011-5: -$22,089.70 against a $26,407.51
  // total). That is a data problem this page reports rather than one it creates.
  for (const shape of MONEY_SHAPES) {
    if (shape.input.subtotalExTax > 0) continue;
    const adjustment = orderTotalRows(shape.input).find((r) => r.label === "Adjustment");
    if (!adjustment) continue;
    const total = Math.abs(shape.input.totalIncTax);
    assert.ok(
      adjustment.amount > 0 && Math.abs(adjustment.amount) < total * 0.9,
      `${shape.name}: an Adjustment of ${adjustment.amount} against a total of ${total}`
    );
  }
});

test("every breakdown that is printed adds up to the stored total", () => {
  for (const shape of MONEY_SHAPES) {
    const rows = orderTotalRows(shape.input);
    if (rows.length === 0) continue;
    const sum = rows.reduce((n, r) => n + r.amount, 0);
    assert.ok(
      Math.abs(sum - shape.input.totalIncTax) < 0.005,
      `${shape.name}: the column sums to ${sum}, not ${shape.input.totalIncTax}`
    );
  }
});

test("the printed lines sum to the printed Subtotal, on every shape", () => {
  for (const shape of MONEY_SHAPES) {
    const rows = orderTotalRows(shape.input);
    const subtotal = rows.find((r) => r.label === "Subtotal");
    if (!subtotal || !shape.input.lines) continue;
    const printedLines = lineSubtotalIncTax(shape.input.lines, orderTaxFactor(shape.input));
    assert.ok(
      Math.abs(printedLines - subtotal.amount) < 0.005,
      `${shape.name}: lines print ${printedLines} under a Subtotal of ${subtotal.amount}`
    );
  }
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
