import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAID_TAX_INVOICE_RECEIPT,
  PRO_FORMA_TAX_INVOICE,
  hasPaymentLanded,
  orderDocumentName,
} from "./order-document-name.ts";

test("an order with nothing paid is a Pro-Forma Tax Invoice", () => {
  assert.equal(orderDocumentName({ amountPaid: 0, paymentStatus: "pending" }), PRO_FORMA_TAX_INVOICE);
  assert.equal(orderDocumentName({}), PRO_FORMA_TAX_INVOICE);
  assert.equal(orderDocumentName({ paymentStatus: "net_terms" }), PRO_FORMA_TAX_INVOICE);
});

test("any payment at all, including a deposit, makes it a Paid Tax Invoice Receipt", () => {
  assert.equal(
    orderDocumentName({ amountPaid: 500, paymentStatus: "partially_paid" }),
    PAID_TAX_INVOICE_RECEIPT
  );
  assert.equal(orderDocumentName({ amountPaid: 0.01 }), PAID_TAX_INVOICE_RECEIPT);
});

test("a settled or refunded order with no ledger rows is still a receipt", () => {
  for (const status of ["paid", "captured", "completed", "refunded", "partially_refunded"]) {
    assert.equal(orderDocumentName({ amountPaid: 0, paymentStatus: status }), PAID_TAX_INVOICE_RECEIPT);
  }
});

test("a sub-cent crumb is not a payment", () => {
  assert.equal(hasPaymentLanded({ amountPaid: 0.004 }), false);
  assert.equal(hasPaymentLanded({ amountPaid: 0.006 }), true);
});
