import { test } from "node:test";
import assert from "node:assert/strict";
import {
  determinePaymentStatus,
  lineUnitPrice,
  buildLineItems,
  withShipping,
  findBelowCostLines,
  type CartLineInput,
} from "./order-draft.ts";

test("determinePaymentStatus maps each method, defaults to pending", () => {
  assert.equal(determinePaymentStatus("stripe"), "awaiting_payment");
  assert.equal(determinePaymentStatus("bank_transfer"), "pending_payment");
  assert.equal(determinePaymentStatus("net_terms"), "net_terms");
  assert.equal(determinePaymentStatus(""), "pending");
  assert.equal(determinePaymentStatus("paypal"), "pending");
});

test("lineUnitPrice prefers sale_price, falls back to list_price", () => {
  assert.equal(lineUnitPrice({ sale_price: "80", list_price: "100" }), 80);
  assert.equal(lineUnitPrice({ sale_price: null, list_price: "100" }), 100);
});

const line = (over: Partial<CartLineInput>): CartLineInput => ({
  product_id: 1,
  variant_id: null,
  product_name: "Widget",
  product_sku: "W1",
  quantity: 1,
  list_price: "100",
  sale_price: null,
  ...over,
});

test("buildLineItems: ex-tax prices add GST on top", () => {
  const { subtotal, itemsTotal, lineItems } = buildLineItems(
    [line({ list_price: "100", quantity: 2 })],
    false
  );
  assert.equal(itemsTotal, 2);
  // 100 ex-tax * 2 = 200 ex, +10% = 220 inc, 20 tax
  assert.equal(round(subtotal.exTax), 200);
  assert.equal(round(subtotal.incTax), 220);
  assert.equal(round(subtotal.tax), 20);
  assert.equal(lineItems[0].basePrice, "100");
  assert.equal(round(Number(lineItems[0].totalIncTax)), 220);
});

test("buildLineItems: inc-tax prices back out GST", () => {
  const { subtotal } = buildLineItems([line({ list_price: "110", quantity: 1 })], true);
  // 110 inc-tax -> 100 ex, 10 tax
  assert.equal(round(subtotal.exTax), 100);
  assert.equal(round(subtotal.incTax), 110);
  assert.equal(round(subtotal.tax), 10);
});

test("buildLineItems: sale_price wins over list_price", () => {
  const { subtotal } = buildLineItems(
    [line({ list_price: "100", sale_price: "80", quantity: 1 })],
    false
  );
  assert.equal(round(subtotal.exTax), 80);
});

test("withShipping rolls inc-tax shipping into the total", () => {
  const subtotal = { exTax: 200, incTax: 220, tax: 20 };
  const { shipping, total } = withShipping(subtotal, 11);
  // 11 inc-tax shipping -> 10 ex, 1 tax
  assert.equal(round(shipping.exTax), 10);
  assert.equal(round(shipping.tax), 1);
  assert.equal(round(total.incTax), 231);
  assert.equal(round(total.exTax), 210);
  assert.equal(round(total.tax), 21);
});

test("withShipping with zero shipping leaves the total at subtotal", () => {
  const subtotal = { exTax: 200, incTax: 220, tax: 20 };
  const { total } = withShipping(subtotal, 0);
  assert.equal(round(total.incTax), 220);
});

test("findBelowCostLines: flags lines under current cost, skips unknown costs and rounding noise", () => {
  const { lineItems } = buildLineItems(
    [
      line({ product_id: 1, product_sku: "AT-COST", list_price: "100", sale_price: "460.00" }),
      line({ product_id: 2, product_sku: "HEALTHY", list_price: "100", sale_price: "529.00" }),
      line({ product_id: 3, product_sku: "NO-COST", list_price: "100", sale_price: "5.00" }),
      line({ product_id: 4, variant_id: 44, product_sku: "VAR", list_price: "100", sale_price: "90.00" }),
    ],
    false
  );
  const costs = new Map<string, number>([
    ["1:0", 460.32], // sold 460.00 → below cost (the FED-1200-6-DSBC shape)
    ["2:0", 460.32], // sold 529.00 → fine
    ["4:44", 95],    // variant cost wins → below
  ]);
  const flagged = findBelowCostLines(lineItems, costs);
  assert.deepEqual(flagged.map((f) => f.sku), ["AT-COST", "VAR"]);
  assert.equal(flagged[0].cost, 460.32);
  assert.equal(flagged[0].unitExTax, 460);

  // Half-cent tolerance: a price within rounding noise of cost is not flagged.
  const { lineItems: noiseItems } = buildLineItems(
    [line({ product_id: 5, product_sku: "NOISE", list_price: "100", sale_price: "460.318" })],
    false
  );
  assert.deepEqual(findBelowCostLines(noiseItems, new Map([["5:0", 460.32]])), []);
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
