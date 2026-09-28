import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBuyButtons, type CompareBuyFacts } from "./compare-buy.ts";

const plain: CompareBuyFacts = { shownPrice: 100, hidePrice: false, kit: null };

test("an ordinary priced product: cart and quote", () => {
  assert.deepEqual(compareBuyButtons(plain), { cart: true, quote: true, priceHidden: false });
});

test("a bundle never offers a cart — quote-only kit or not (product 11550's case)", () => {
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: true } }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: false } }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: true } }).quote, true);
  // A grouped kit is not a bundle: it keeps the product page's cart.
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "grouped", quoteOnly: false } }).cart, true);
});

test("a hidden price takes the cart and the figure away, like the page's masked price", () => {
  assert.deepEqual(compareBuyButtons({ ...plain, hidePrice: true }), { cart: false, quote: true, priceHidden: true });
  assert.equal(compareBuyButtons({ ...plain, shownPrice: 0 }).cart, false);
});

test("per-product refusals: restrict cart / quote, Zoey quote-only", () => {
  assert.equal(compareBuyButtons({ ...plain, restrictAddToCart: true }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, purchasingDisabled: true }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, restrictAddToQuote: true }).quote, false);
});

test("'do not sell when out of stock' refuses the cart only when the shelf is empty", () => {
  const deny = { ...plain, backorderPolicy: "deny", inventoryTracking: "product" };
  assert.equal(compareBuyButtons({ ...deny, inventoryLevel: 0 }).cart, false);
  assert.equal(compareBuyButtons({ ...deny, inventoryLevel: -3 }).cart, false);
  assert.equal(compareBuyButtons({ ...deny, inventoryLevel: 2 }).cart, true);
  // Back-order allowed, or untracked: never refused on stock.
  assert.equal(compareBuyButtons({ ...plain, backorderPolicy: "allow_notify", inventoryTracking: "product", inventoryLevel: 0 }).cart, true);
  assert.equal(compareBuyButtons({ ...plain, backorderPolicy: "deny", inventoryTracking: "none", inventoryLevel: 0 }).cart, true);
});
