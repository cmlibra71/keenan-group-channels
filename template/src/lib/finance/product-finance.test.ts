import { test } from "node:test";
import assert from "node:assert/strict";
import { bestVisiblePrice, productFinanceOffer } from "./product-finance.ts";
import { weeklyRent, SILVERCHEF_WEEKLY_RATE, SKOPE_WEEKLY_RATE } from "@keenan/services/finance";

test("the figure is the shared calculator's, not a second copy of the formula", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 53800 },
    sku: "RC-54341",
    pricesIncludeTax: false,
  });
  assert.ok(offer);
  // 53,800 ex GST → 59,180 inc GST → the services module's own answer.
  assert.equal(offer.priceIncGst, 59180);
  assert.equal(offer.weekly, weeklyRent(59180, SILVERCHEF_WEEKLY_RATE));
});

test("a GST-inclusive channel is not taxed twice", () => {
  const offer = productFinanceOffer({ price: { displayPrice: 1100 }, pricesIncludeTax: true });
  assert.ok(offer);
  assert.equal(offer.priceIncGst, 1100);
  assert.equal(offer.weekly, weeklyRent(1100, SILVERCHEF_WEEKLY_RATE));
});

test("a SKOPE SKU rents at SKOPE's rate, under SKOPE's own words", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 5000 },
    sku: "SKO-BME1200",
    pricesIncludeTax: true,
  });
  assert.ok(offer);
  assert.equal(offer.funder, "skope");
  assert.equal(offer.weekly, weeklyRent(5000, SKOPE_WEEKLY_RATE));
  assert.equal(offer.text, `Own Me ${offer.amount} a week`);
});

test("everything else is SilverChef, under SilverChef's words", () => {
  const offer = productFinanceOffer({ price: { displayPrice: 5000 }, sku: "RC-1", pricesIncludeTax: true });
  assert.ok(offer);
  assert.equal(offer.funder, "silverchef");
  assert.equal(offer.text, `Rent per Week: ${offer.amount}`);
});

test("the rent follows the price this shopper is being shown", () => {
  // Sale price beats list; a member/contract price beats the sale price.
  assert.equal(bestVisiblePrice({ displayPrice: 1000, displaySalePrice: 900 }), 900);
  assert.equal(bestVisiblePrice({ displayPrice: 1000, displaySalePrice: 900, memberPrice: 800 }), 800);
  // A member price that is not actually cheaper is ignored, exactly as the buy
  // box's `hasSave` ignores it — never quote a rent above the price on screen.
  assert.equal(bestVisiblePrice({ displayPrice: 1000, memberPrice: 1200 }), 1000);
  assert.equal(bestVisiblePrice({ displayPrice: 1000, memberPrice: 0 }), 1000);
});

test("no price means no panel — a quote-only product has no rent to quote", () => {
  assert.equal(productFinanceOffer({ price: { displayPrice: 0 }, pricesIncludeTax: true }), null);
  assert.equal(
    productFinanceOffer({ price: { displayPrice: 0, displaySalePrice: 0, memberPrice: null }, pricesIncludeTax: false }),
    null
  );
  // A negative or non-numeric price is the same answer, not a negative rent.
  assert.equal(productFinanceOffer({ price: { displayPrice: -50 }, pricesIncludeTax: true }), null);
  assert.equal(productFinanceOffer({ price: { displayPrice: NaN }, pricesIncludeTax: true }), null);
});

test("there is NO $1,000 floor on the product page — that is a checkout rule", () => {
  const offer = productFinanceOffer({ price: { displayPrice: 120 }, pricesIncludeTax: true });
  assert.ok(offer, "a cheap product still shows its weekly figure (Tim: 'It can show for all products')");
  assert.equal(offer.weekly, weeklyRent(120, SILVERCHEF_WEEKLY_RATE));
});

test("the money is formatted, GST inclusive, to the cent", () => {
  const offer = productFinanceOffer({ price: { displayPrice: 53800 }, pricesIncludeTax: false });
  assert.ok(offer);
  assert.match(offer.amount, /^\$[\d,]+\.\d{2}$/);
});
