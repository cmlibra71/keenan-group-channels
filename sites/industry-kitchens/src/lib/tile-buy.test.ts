import { test } from "node:test";
import assert from "node:assert/strict";
import { tileBuyFacts } from "./tile-buy.ts";

// Old site (industrykitchens.com.au, guest, 2026-09-28) — one real tile per row.
test("simple, priced, unrestricted (Tablekraft 13000-56): Add to Quote + Add to Basket", () => {
  assert.deepEqual(tileBuyFacts({ price: "612.04", salePrice: "476.03" }), { viewDetails: false, cart: true, quote: true });
});

test("a required question (Cobra CF2, Gas Type): View Details only", () => {
  const f = tileBuyFacts({ price: "3765.45", answerRequired: true });
  assert.equal(f.viewDetails, true);
  assert.equal(f.cart, false);
});

test("configurable (Chef Works BEAN-BLK, Starting From): View Details", () => {
  const f = tileBuyFacts({ price: "0", fromPrice: "14.50", fromSalePrice: "13.59" });
  assert.equal(f.viewDetails, true);
  assert.equal(f.cart, false);
});

test("POA / $0 (Edlund 27000): Add to Quote only", () => {
  assert.deepEqual(tileBuyFacts({ price: "0" }), { viewDetails: false, cart: false, quote: true });
});

test("Zoey quote-only switch (purchasing disabled) and a refused cart: Add to Quote only", () => {
  assert.deepEqual(tileBuyFacts({ price: "175.90", purchasingDisabled: true }), { viewDetails: false, cart: false, quote: true });
  assert.deepEqual(tileBuyFacts({ price: "175.90", restrictAddToCart: true }), { viewDetails: false, cart: false, quote: true });
});

test("refuses quotes: no Add to Quote", () => {
  assert.equal(tileBuyFacts({ price: "10", restrictAddToQuote: true }).quote, false);
});

test("switched off (availability disabled): no Add to Basket", () => {
  assert.equal(tileBuyFacts({ price: "10", availability: "disabled" }).cart, false);
});

test("the snake_case fact reads the same as camelCase", () => {
  assert.equal(tileBuyFacts({ price: "10", answer_required: true }).viewDetails, true);
});

test("grouped (I-Fresh Sample Pack): no buttons at all", () => {
  assert.deepEqual(tileBuyFacts({ price: "0", zoeyType: "grouped" }), { viewDetails: false, cart: false, quote: false });
});

test("out of stock in Zoey (stock managed, is_in_stock 0 — KH 97213): no buttons at all", () => {
  assert.deepEqual(tileBuyFacts({ price: "277.20", channelRules: { out_of_stock: true } }), { viewDetails: false, cart: false, quote: false });
  // …the same fact after the search path folded the rule into the row's flags.
  assert.deepEqual(tileBuyFacts({ price: "277.20", restrictAddToCart: true, restrictAddToQuote: true }), { viewDetails: false, cart: false, quote: false });
});
