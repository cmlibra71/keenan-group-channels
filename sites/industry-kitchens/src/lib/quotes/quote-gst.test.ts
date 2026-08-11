import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteGstTotals,
  quoteTotalIncludesGst,
  isMoneyRow,
  type QuoteGstInput,
  type QuoteGstTotals,
} from "./quote-gst";

/** The contract the summary leans on: every printed row adds up to the total. */
function assertReconciles(t: QuoteGstTotals): void {
  const rows =
    t.subtotalEx - t.discountEx - t.couponEx - t.giftEx - t.creditEx + t.freightEx + t.adjustmentEx;
  assert.ok(
    Math.abs(rows - t.exTax) < 0.01,
    `rows ${rows} should reconcile to exTax ${t.exTax}`
  );
  assert.ok(
    Math.abs(t.exTax + t.tax - t.incTax) < 0.01,
    `${t.exTax} + ${t.tax} should equal ${t.incTax}`
  );
}

test("a portal-native total is ex-GST, so GST is added", () => {
  const t = quoteGstTotals(61, { base_amount: "61" });
  assert.equal(t.exTax, 61);
  assert.equal(t.tax, 6.1);
  assert.equal(t.incTax, 67.1);
  assertReconciles(t);
});

test("a Zoey total already includes GST, so it is not charged twice", () => {
  const quote: QuoteGstInput = { external_source: "zoey", base_amount: "1819" };
  assert.equal(quoteTotalIncludesGst(quote, 2000.9), true);
  const t = quoteGstTotals(2000.9, quote);
  assert.equal(t.incTax, 2000.9);
  assert.equal(t.exTax, 1819);
  assert.equal(t.subtotalEx, 1819);
  assert.equal(t.freightEx, 0);
  assertReconciles(t);
});

test("freight baked into a Zoey grand total gets its own row (QU:57261224)", () => {
  const quote: QuoteGstInput = {
    external_source: "zoey",
    base_amount: "4470",
    shipping_cost: "0",
  };
  const t = quoteGstTotals(5632, quote);
  assert.equal(t.subtotalEx, 4470);
  assert.equal(t.freightEx, 650);
  assert.equal(t.exTax, 5120);
  assert.equal(t.tax, 512);
  assert.equal(t.incTax, 5632);
  assertReconciles(t);
});

test("a Zoey total that equals its ex-GST components carries no GST", () => {
  const quote: QuoteGstInput = { external_source: "zoey", base_amount: "500" };
  assert.equal(quoteTotalIncludesGst(quote, 500), false);
  const t = quoteGstTotals(500, quote);
  assert.equal(t.incTax, 550);
  assertReconciles(t);
});

test("a total below its components is balanced by an Adjustment", () => {
  const t = quoteGstTotals(900, { external_source: "zoey", base_amount: "1000" });
  assert.ok(t.adjustmentEx < 0);
  assert.equal(t.freightEx, 0);
  assertReconciles(t);
});

test("a GST-free rate shows no GST and leaves the total alone", () => {
  const t = quoteGstTotals(100, { base_amount: "100" }, 0);
  assert.equal(t.tax, 0);
  assert.equal(t.incTax, 100);
  assert.equal(t.exTax, 100);
  assertReconciles(t);
});

test("a GST-inclusive quote's components are divided down too", () => {
  const t = quoteGstTotals(121, {
    tax_inclusive: true,
    base_amount: "110",
    discount_amount: "11",
    shipping_cost: "22",
  });
  assert.equal(t.subtotalEx, 100);
  assert.equal(t.discountEx, 10);
  assert.equal(t.freightEx, 20);
  assert.equal(t.incTax, 121);
  assertReconciles(t);
});

test("every production quote shape reconciles", () => {
  const rows: Array<[number, QuoteGstInput]> = [
    [0, { external_source: "zoey", base_amount: "0" }],
    [500, { external_source: "zoey", base_amount: "500" }],
    [2000.9, { external_source: "zoey", base_amount: "1819" }],
    [44257.64, { external_source: "zoey", base_amount: "30684.22" }],
    [1050, { external_source: "zoey", base_amount: "1000" }],
    [900, { external_source: "zoey", base_amount: "1000" }],
    [61, { base_amount: "61" }],
    [370, {
      base_amount: "2660",
      coupon_discount: "400",
      store_credit_amount: "2000",
      gift_certificate_amount: "50",
      shipping_cost: "160",
    }],
  ];
  for (const [total, quote] of rows) assertReconciles(quoteGstTotals(total, quote));
});

test("isMoneyRow treats a rounded zero as nothing to print", () => {
  assert.equal(isMoneyRow(0), false);
  assert.equal(isMoneyRow(0.001), false);
  assert.equal(isMoneyRow(0.01), true);
  assert.equal(isMoneyRow(-12.5), true);
});
