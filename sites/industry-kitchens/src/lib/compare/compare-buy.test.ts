import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBuyButtons, type CompareBuyFacts } from "./compare-buy.ts";

const plain: CompareBuyFacts = { shownPrice: 100, hidePrice: false, kit: null };

test("an ordinary priced product: cart and quote", () => {
  assert.deepEqual(compareBuyButtons(plain), { cart: true, quote: true, priceHidden: false, answerRequired: false });
});

test("a bundle never offers a cart — quote-only kit or not (product 11550's case)", () => {
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: true } }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: false } }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "bundle", quoteOnly: true } }).quote, true);
  // A grouped kit is not a bundle: it keeps the product page's cart.
  assert.equal(compareBuyButtons({ ...plain, kit: { kind: "grouped", quoteOnly: false } }).cart, true);
});

test("a hidden price takes the cart and the figure away, like the page's masked price", () => {
  assert.deepEqual(compareBuyButtons({ ...plain, hidePrice: true }), { cart: false, quote: true, priceHidden: true, answerRequired: false });
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

test("any required question, default or not: no cart, no quote — the column opens the product page (Zoey's tile)", () => {
  // Interstate Surcharge has no default; Gas Type has Natural Gas pre-selected — Zoey's tile
  // says View Details for both.
  for (const q of [["Interstate Surcharge"], ["Gas Type"]]) {
    assert.equal(compareBuyButtons({ ...plain, requiredQuestions: q }).answerRequired, true);
  }
  assert.deepEqual(compareBuyButtons({ ...plain, requiredQuestions: ["Interstate Surcharge"] }), {
    cart: false,
    quote: false,
    priceHidden: false,
    answerRequired: true,
  });
  // No required question: unchanged.
  assert.deepEqual(compareBuyButtons({ ...plain, requiredQuestions: [] }), compareBuyButtons(plain));
  assert.deepEqual(compareBuyButtons({ ...plain, requiredQuestions: null }), compareBuyButtons(plain));
});

test("this storefront's Zoey rules (services channel-rules), per viewer", () => {
  const rules = (r: Record<string, boolean>) => ({ quoteOnly: false, guestQuoteOnly: false, outOfStock: false, searchOnly: false, cartDisabled: false, guestQuoteHidden: false, backorderSilent: false, backorderDeny: false, ...r });
  const member = { loggedIn: true };
  // cart_disabled: no basket for anyone, price stays, quote stays.
  assert.deepEqual(compareBuyButtons({ ...plain, channelRules: rules({ cartDisabled: true }), viewer: member }), { cart: false, quote: true, priceHidden: false, answerRequired: false });
  // quote_only ($0 / POA): price hidden too.
  assert.deepEqual(compareBuyButtons({ ...plain, channelRules: rules({ quoteOnly: true }), viewer: member }), { cart: false, quote: true, priceHidden: true, answerRequired: false });
  // out of stock: no cart, quote stays (the product page's rule).
  assert.equal(compareBuyButtons({ ...plain, channelRules: rules({ outOfStock: true }), viewer: member }).cart, false);
  // guest quote-only: guests lose the cart, signed-in customers keep it; no viewer reads as a guest.
  assert.equal(compareBuyButtons({ ...plain, channelRules: rules({ guestQuoteOnly: true }), viewer: { loggedIn: false } }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, channelRules: rules({ guestQuoteOnly: true }) }).cart, false);
  assert.equal(compareBuyButtons({ ...plain, channelRules: rules({ guestQuoteOnly: true }), viewer: member }).cart, true);
  // no rules: unchanged.
  assert.equal(compareBuyButtons({ ...plain, channelRules: null, viewer: member }).cart, true);
});

test("guest_quote_hidden: a guest gets no Add to Quote in the compare column; a signed-in customer keeps it", () => {
  const base = { shownPrice: 24.5, hidePrice: false, kit: null };
  const rules = { quoteOnly: false, guestQuoteOnly: false, outOfStock: false, searchOnly: false, cartDisabled: true, guestQuoteHidden: true, backorderSilent: false, backorderDeny: false };
  assert.deepEqual(compareBuyButtons({ ...base, channelRules: rules, viewer: { loggedIn: false } }), { cart: false, quote: false, priceHidden: false, answerRequired: false });
  assert.deepEqual(compareBuyButtons({ ...base, channelRules: rules }), { cart: false, quote: false, priceHidden: false, answerRequired: false });
  assert.deepEqual(compareBuyButtons({ ...base, channelRules: rules, viewer: { loggedIn: true } }), { cart: false, quote: true, priceHidden: false, answerRequired: false });
});
