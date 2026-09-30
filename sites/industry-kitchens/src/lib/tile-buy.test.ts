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
  assert.deepEqual(tileBuyFacts({ price: "277.20", restrictAddToCart: true, restrictAddToQuote: true, zoeyOutOfStock: true }), { viewDetails: false, cart: false, quote: false });
  // A required question on an out-of-stock product (Xtracta 1800): still nothing — no View Details.
  assert.deepEqual(tileBuyFacts({ price: "2730", answerRequired: true, zoeyOutOfStock: true }), { viewDetails: false, cart: false, quote: false });
});

test("View Product stands in place of Add to Basket (IK, old site 2026-09-30): no-basket products with a required option show Add to Quote only", () => {
  // Search rows as they reach the grid: rules folded (restrictAddToCart), derived facts kept.
  const benxon = { price: "0", answerRequired: true, zoeyTileButtons: true, restrictAddToCart: true, zoeyCartDisabled: true, zeroPriceLift: "no" };
  const polar = { price: "2639.90", salePrice: "2276.91", answerRequired: true, zoeyTileButtons: true, restrictAddToCart: true, zoeyCartDisabled: true };
  const skope = { price: "0", answerRequired: true, zoeyTileButtons: true, restrictAddToCart: true, zeroPriceLift: "yes" };
  assert.deepEqual(tileBuyFacts(benxon), { viewDetails: false, cart: false, quote: true });
  assert.deepEqual(tileBuyFacts(polar), { viewDetails: false, cart: false, quote: true });
  assert.deepEqual(tileBuyFacts(skope), { viewDetails: true, cart: false, quote: true });
  // A basket-offered product with a required question keeps View Product (Deep Fryers, Display Fridges).
  assert.deepEqual(tileBuyFacts({ price: "1200", answerRequired: true, zoeyTileButtons: true }), { viewDetails: true, cart: false, quote: true });
  // A clearance row still carrying its rules object reads cart_disabled from it.
  assert.equal(tileBuyFacts({ price: "10", answerRequired: true, zoeyTileButtons: true, channelRules: { cart_disabled: true } }).viewDetails, false);
  // Not an IK-stamped row: unchanged (View Product whenever a question is asked).
  assert.equal(tileBuyFacts({ price: "10", answerRequired: true, restrictAddToCart: true, zoeyCartDisabled: true }).viewDetails, true);
  // A configurable ("Starting From") still opens the page whatever the basket.
  assert.equal(tileBuyFacts({ price: "10", fromPrice: "10", answerRequired: false, zoeyTileButtons: true, zoeyCartDisabled: true }).viewDetails, true);
});
