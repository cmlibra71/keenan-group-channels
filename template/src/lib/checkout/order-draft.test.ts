import { test } from "node:test";
import assert from "node:assert/strict";
import {
  determinePaymentStatus,
  lineUnitPrice,
  buildLineItems,
  withShipping,
  findBelowCostLines,
  withLineCosts,
  withBackorderedQuantities,
  memberSavings,
  type CartLineInput,
} from "./order-draft.ts";

test("determinePaymentStatus maps each method, defaults to pending", () => {
  assert.equal(determinePaymentStatus("stripe"), "awaiting_payment");
  assert.equal(determinePaymentStatus("bank_transfer"), "pending_payment");
  assert.equal(determinePaymentStatus("net_terms"), "net_terms");
  assert.equal(determinePaymentStatus(""), "pending");
  assert.equal(determinePaymentStatus("paypal"), "pending");
});

test("a finance order is placed unpaid, exactly like a bank transfer", () => {
  // Card VAjaPj0t: nothing is charged until the finance settles, so both
  // finance buttons must land on the SAME status bank transfer lands on —
  // never awaiting_payment (which reads as a card in flight) and never paid.
  assert.equal(determinePaymentStatus("silverchef"), determinePaymentStatus("bank_transfer"));
  assert.equal(determinePaymentStatus("finance"), determinePaymentStatus("bank_transfer"));
  assert.equal(determinePaymentStatus("silverchef"), "pending_payment");
  assert.equal(determinePaymentStatus("finance"), "pending_payment");
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

test("withShipping adds GST on top of the ex-GST rate", () => {
  const subtotal = { exTax: 200, incTax: 220, tax: 20 };
  const { shipping, total } = withShipping(subtotal, 10);
  // A $10 rate is $10 ex + $1 GST = $11 to pay — never $9.09 + $0.91.
  assert.equal(round(shipping.exTax), 10);
  assert.equal(round(shipping.tax), 1);
  assert.equal(round(shipping.incTax), 11);
  assert.equal(round(total.incTax), 231);
  assert.equal(round(total.exTax), 210);
  assert.equal(round(total.tax), 21);
});

test("withShipping: the $30 floor rate bills $30 ex / $33 inc (card twwZMnMY)", () => {
  // The live defect: a Chefs Depot invoice printed Shipping & Handling $27.27 against a $30
  // flat rate, because the rate was read as GST-inclusive and divided by 1.1.
  const subtotal = { exTax: 320, incTax: 352, tax: 32 };
  const { shipping, total } = withShipping(subtotal, 30);
  assert.equal(round(shipping.exTax), 30);
  assert.equal(round(shipping.tax), 3);
  assert.equal(round(shipping.incTax), 33);
  assert.equal(round(total.exTax), 350);
  assert.equal(round(total.tax), 35);
  assert.equal(round(total.incTax), 385);
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

test("withLineCosts: freezes the buy cost onto each line at the time of sale", () => {
  const { lineItems } = buildLineItems(
    [
      line({ product_id: 1, product_sku: "COSTED", list_price: "100", sale_price: "120.00" }),
      line({ product_id: 2, product_sku: "NO-COST", list_price: "100", sale_price: "120.00" }),
      line({ product_id: 4, variant_id: 44, product_sku: "VAR", list_price: "100", sale_price: "120.00" }),
    ],
    false
  );
  const costs = new Map<string, number>([
    ["1:0", 90],
    ["4:44", 95],
    ["9:0", 1], // a cost for a product not in the cart — ignored
  ]);
  const withCosts = withLineCosts(lineItems, costs);

  assert.equal(withCosts[0].baseCostPrice, "90");
  assert.equal(withCosts[0].costPriceExTax, "90");
  // A line with no known cost carries NO cost fields at all — never 0, which
  // downstream would read as "we got it for free".
  assert.equal(withCosts[1].baseCostPrice, undefined);
  assert.equal(withCosts[1].costPriceExTax, undefined);
  assert.equal("baseCostPrice" in withCosts[1], false);
  // Variant cost is keyed by variant id.
  assert.equal(withCosts[2].baseCostPrice, "95");

  // Pure: the input drafts are untouched.
  assert.equal("baseCostPrice" in lineItems[0], false);
});

test("withLineCosts: a zero or negative cost is treated as unknown", () => {
  const { lineItems } = buildLineItems(
    [line({ product_id: 1, product_sku: "ZERO", list_price: "100", sale_price: "120.00" })],
    false
  );
  assert.equal(withLineCosts(lineItems, new Map([["1:0", 0]]))[0].baseCostPrice, undefined);
  assert.equal(withLineCosts(lineItems, new Map([["1:0", -5]]))[0].baseCostPrice, undefined);
  assert.equal(withLineCosts(lineItems, new Map([["1:0", NaN]]))[0].baseCostPrice, undefined);
});

test("withLineCosts: costs and the below-cost sentry read the SAME map", () => {
  const { lineItems } = buildLineItems(
    [line({ product_id: 1, product_sku: "AT-COST", list_price: "100", sale_price: "460.00" })],
    false
  );
  const costs = new Map<string, number>([["1:0", 460.32]]);
  assert.equal(findBelowCostLines(lineItems, costs).length, 1);
  assert.equal(withLineCosts(lineItems, costs)[0].costPriceExTax, "460.32");
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Member savings recorded at the moment of sale (card pgRmsaTX) ──────────────

test("memberSavings: counts list minus charged, per line, and adds GST", () => {
  const s = memberSavings(
    [
      line({ product_id: 1, product_sku: "A", quantity: 2, list_price: "100", sale_price: "80" }),
      line({ product_id: 2, product_sku: "B", quantity: 1, list_price: "50", sale_price: "45" }),
    ],
    false
  );
  assert.equal(s.savedExTax, 45); // (100-80)*2 + (50-45)
  assert.equal(s.savedIncTax, 49.5);
  assert.equal(s.lines.length, 2);
  assert.equal(s.lines[0].nonMemberUnit, 100);
  assert.equal(s.lines[0].chargedUnit, 80);
});

test("memberSavings: a line charged at list saved nothing and is not listed", () => {
  const s = memberSavings([line({ list_price: "100", sale_price: null })], false);
  assert.equal(s.savedExTax, 0);
  assert.equal(s.lines.length, 0);
});

test("memberSavings: a line charged ABOVE list never counts as a negative saving", () => {
  const s = memberSavings(
    [
      line({ product_id: 1, list_price: "100", sale_price: "120" }),
      line({ product_id: 2, list_price: "100", sale_price: "90" }),
    ],
    false
  );
  assert.equal(s.savedExTax, 10);
  assert.equal(s.lines.length, 1);
});

test("memberSavings: GST-split rounding noise is not a saving", () => {
  const s = memberSavings([line({ list_price: "100.004", sale_price: "100" })], false);
  assert.equal(s.savedExTax, 0);
  assert.equal(s.lines.length, 0);
});

test("memberSavings: on a GST-inclusive channel the stored price IS the inc-GST figure", () => {
  const s = memberSavings([line({ list_price: "110", sale_price: "88" })], true);
  assert.equal(s.savedIncTax, 22);
  assert.equal(s.savedExTax, 20);
});

test("withBackorderedQuantities stamps only the units that were not on the shelf", () => {
  // Card 7vu2iEEZ. Stamped ONCE at order time: stock moves nightly, so a derived answer would
  // quietly rewrite what the order says the customer was told.
  const lines = buildLineItems(
    [
      // wants 2, none on hand → both on back order (Tim's own example)
      { product_id: 1, variant_id: null, product_name: "Oven", product_sku: "A", quantity: 2, list_price: "100", sale_price: null },
      // wants 5, 3 on hand → 2 short
      { product_id: 2, variant_id: null, product_name: "Knife", product_sku: "B", quantity: 5, list_price: "10", sale_price: null },
      // fully in stock → no stamp at all, so "none" stays distinguishable from "never worked out"
      { product_id: 3, variant_id: null, product_name: "Tray", product_sku: "C", quantity: 1, list_price: "10", sale_price: null },
      // untracked → never on back order
      { product_id: 4, variant_id: null, product_name: "Cloth", product_sku: "D", quantity: 9, list_price: "5", sale_price: null },
      // set to refuse out-of-stock buys → the order should never have got here, and is not stamped
      { product_id: 5, variant_id: null, product_name: "Mixer", product_sku: "E", quantity: 3, list_price: "50", sale_price: null },
    ] as CartLineInput[],
    false
  ).lineItems;

  const stamped = withBackorderedQuantities(
    lines,
    new Map([
      [1, { inventoryTracking: "product", inventoryLevel: 0, backorderPolicy: null }],
      [2, { inventoryTracking: "product", inventoryLevel: 3, backorderPolicy: "allow_notify" }],
      [3, { inventoryTracking: "product", inventoryLevel: 4, backorderPolicy: "allow_notify" }],
      [4, { inventoryTracking: "none", inventoryLevel: 0, backorderPolicy: null }],
      [5, { inventoryTracking: "product", inventoryLevel: 0, backorderPolicy: "deny" }],
    ])
  );

  assert.equal(stamped[0].backorderedQuantity, 2);
  assert.equal(stamped[1].backorderedQuantity, 2);
  assert.equal(stamped[2].backorderedQuantity, undefined);
  assert.equal(stamped[3].backorderedQuantity, undefined);
  assert.equal(stamped[4].backorderedQuantity, undefined);
});

test("withBackorderedQuantities stamps a line the shopper was never told about", () => {
  // "allow_silent" hides the note from the shopper — it does NOT hide the fact from the
  // warehouse or the sales desk, who still have to know the goods are not here.
  const lines = buildLineItems(
    [{ product_id: 7, variant_id: null, product_name: "Fridge", product_sku: "F", quantity: 4, list_price: "900", sale_price: null }] as CartLineInput[],
    false
  ).lineItems;
  const stamped = withBackorderedQuantities(
    lines,
    new Map([[7, { inventoryTracking: "product", inventoryLevel: 1, backorderPolicy: "allow_silent" }]])
  );
  assert.equal(stamped[0].backorderedQuantity, 3);
});

test("withBackorderedQuantities leaves a line whose product it could not read alone", () => {
  // The stock lookup is best-effort at checkout: an order must never fail to place over it, and
  // an unstamped line reads as "we never worked it out" rather than "nothing was on back order".
  const lines = buildLineItems(
    [{ product_id: 8, variant_id: null, product_name: "Pan", product_sku: "G", quantity: 2, list_price: "20", sale_price: null }] as CartLineInput[],
    false
  ).lineItems;
  assert.equal(withBackorderedQuantities(lines, new Map())[0].backorderedQuantity, undefined);
});

// ── The configuration a line was bought as (cards 0CDcCYmO + kyMjCmAw) ───────

const configuredLine: CartLineInput = {
  product_id: 8820,
  variant_id: null,
  product_name: "Custom Stainless Steel",
  product_sku: "Custom-Stainless-Steel",
  quantity: 1,
  list_price: "1000",
  sale_price: null,
  modifier_selections: [
    {
      groupKey: "instructions",
      groupLabel: "Instructions",
      optionKey: "text",
      optionLabel: "1200mm bench, sink on the left",
      price: "0.00",
      url: null,
    },
  ],
};

test("buildLineItems carries the typed instruction onto the order line", () => {
  const { lineItems } = buildLineItems([configuredLine], false);
  assert.deepEqual(lineItems[0].productOptions, {
    Instructions: "1200mm bench, sink on the left",
  });
});

test("the instruction moves no money — the line totals are the bare price", () => {
  const withText = buildLineItems([configuredLine], false);
  const withoutText = buildLineItems([{ ...configuredLine, modifier_selections: [] }], false);
  assert.equal(withText.subtotal.exTax, withoutText.subtotal.exTax);
  assert.equal(withText.lineItems[0].totalIncTax, withoutText.lineItems[0].totalIncTax);
});

test("a line with no configuration carries NO product_options key at all", () => {
  // Never `{}`: an empty object would rewrite 73,439 historic lines' shape for
  // nothing, and the portal renders the key's presence.
  const { lineItems } = buildLineItems([{ ...configuredLine, modifier_selections: undefined }], false);
  assert.equal("productOptions" in lineItems[0], false);
});

test("the configuration survives the cost and back-order passes", () => {
  const { lineItems } = buildLineItems([configuredLine], false);
  const costed = withLineCosts(lineItems, new Map([["8820:0", 600]]));
  const stamped = withBackorderedQuantities(costed, new Map());
  assert.deepEqual(stamped[0].productOptions, {
    Instructions: "1200mm bench, sink on the left",
  });
});
