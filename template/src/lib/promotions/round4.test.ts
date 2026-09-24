/**
 * Round 4 of card p6YVxc4P on the storefront: offers are never taken off paid add-ons; every
 * offer is judged for the actual shopper (customer group, guest email); a capped offer or coupon
 * is reserved inside a transaction BEFORE payment and an order that loses it is removed, not
 * charged; the product page and the bundle page state what the cart will charge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lineOfferBase, lineUnitCharge, type OfferCartLine } from "./cart-offers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const line = (over: Partial<OfferCartLine>): OfferCartLine => ({
  id: 1,
  product_id: 10,
  variant_id: null,
  quantity: 1,
  list_price: "1000.00",
  sale_price: "1150.00",
  product_sku: "CAP-1",
  ...over,
});

test("an offer is taken off the product, never off its paid add-ons", () => {
  const withExtras = line({
    // $150 of extras sit inside the $1,150 sale price (`withAddonSurcharge`).
    modifier_selections: [
      { groupKey: "warranty", optionKey: "3y", price: "100.00" },
      { groupKey: "install", optionKey: "std", price: "50.00" },
    ],
  });
  assert.equal(lineUnitCharge(withExtras), 1150);
  assert.equal(lineOfferBase(withExtras), 1000);
  assert.equal(lineOfferBase(line({})), 1150);
  assert.equal(lineOfferBase(line({ modifier_selections: [{ groupKey: "x", optionKey: "y", price: "5000" }] })), 0);
});

test("every cart offer call is judged for the actual shopper", () => {
  const offers = read("cart-offers.ts");
  assert.match(offers, /resolveOrderPricingGroupId\(/);
  assert.match(offers, /customerGroupId,\n/);
  assert.match(offers, /email: options\.email \?\? null/);
  const cart = read("../actions/cart.ts");
  assert.equal((cart.match(/currentShopperForOffers\(\)/g) ?? []).length >= 2, true);
  assert.match(read("../../app/api/shipping/calculate/route.ts"), /currentShopperForOffers\(\)/);
});

test("placeOrder reserves offers before payment and removes an order that lost one", () => {
  const src = read("../actions/checkout.ts");
  const reserve = src.indexOf("await reserveOffersForOrder(");
  const stripe = src.indexOf("For Stripe: create PaymentIntent");
  assert.ok(reserve > 0 && stripe > reserve, "reservation runs before the payment step");
  assert.match(src, /OfferNoLongerAvailableError/);
  assert.match(src, /await removeUnchargedOrder\(order\.id\);\n\s+return \{\n\s+error:/);
  // The old swallowed redemption is gone.
  assert.doesNotMatch(src, /couponService\.redeem\(/);
  assert.doesNotMatch(src, /stampOrderItemPromotionsById/);
});

test("the product page hides spent offers and clamps bands to the floor", () => {
  const src = read("../../components/product/ProductOfferTiers.tsx");
  assert.match(src, /loadPromotionUseCounts/);
  assert.match(src, /Math\.min\(r\.percent, maxPercent\)/);
});

test("the bundle page is priced by the cart's engine", () => {
  const src = read("bundles.ts");
  assert.match(src, /evaluateBasketPromotions\(/);
  assert.match(src, /addable: allResolved && applies && saving > 0/);
  assert.doesNotMatch(src, /componentTotal \* \(1 - rule\.percent \/ 100\)/);
});
