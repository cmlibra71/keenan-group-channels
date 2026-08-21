import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINANCE_APPLY_PATH,
  bestVisiblePrice,
  financeApplyFundingTypes,
  productFinanceOffer,
} from "./product-finance.ts";
import {
  weeklyRent,
  SILVERCHEF_WEEKLY_RATE,
  SKOPE_WEEKLY_RATE,
  FUNDING_TYPE_SKOPE,
  FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
} from "@keenan/services/finance";

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

test("a SKU that STARTS with SKOPE is a SKOPE machine too (Steve, 2026-08-19)", () => {
  // Steve's own example on the card. The live site's `SKO-` rule never matched
  // it, so this fridge quoted SilverChef's 5.5% until now.
  const offer = productFinanceOffer({
    price: { displayPrice: 5000 },
    sku: "SKOPE-TCE1000N",
    pricesIncludeTax: true,
  });
  assert.ok(offer);
  assert.equal(offer.funder, "skope");
  assert.equal(offer.weekly, weeklyRent(5000, SKOPE_WEEKLY_RATE));
});

test("a SKOPE-BRANDED product rents at SKOPE's rate even when its code says nothing", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 5000 },
    sku: "BB380X-2SW",
    brand: "SKOPE",
    pricesIncludeTax: true,
  });
  assert.ok(offer);
  assert.equal(offer.funder, "skope");
  assert.equal(offer.weekly, weeklyRent(5000, SKOPE_WEEKLY_RATE));
  assert.equal(offer.text, `Own Me ${offer.amount} a week`);
});

test("a brand we hold never pushes a SKO- machine back onto SilverChef", () => {
  // Skope distributes Irinox; those products carry SKO- codes and rent at
  // SKOPE's factor today. Steve said "as well", so nothing loses the rate.
  const offer = productFinanceOffer({
    price: { displayPrice: 5000 },
    sku: "SKO-MF250.2",
    brand: "IRINOX",
    pricesIncludeTax: true,
  });
  assert.ok(offer);
  assert.equal(offer.funder, "skope");
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

// ── The storefront's own rates (card 6GBlDtwf) ─────────────────────────────

test("the product panel quotes at this storefront's rate, not the shipped one", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "RC-1",
    pricesIncludeTax: true,
    rates: { standard: 0.06, skope: 0.03625 },
  });
  // 11000 x 6% x 12 / 52
  assert.equal(offer?.weekly, 152.31);
  assert.equal(offer?.text, "Rent per Week: $152.31");
});

test("a SKOPE product quotes at this storefront's SKOPE rate", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "SKO-1",
    pricesIncludeTax: true,
    rates: { standard: 0.06, skope: 0.04 },
  });
  assert.equal(offer?.funder, "skope");
  // 11000 x 4% x 12 / 52
  assert.equal(offer?.weekly, 101.54);
});

test("no rates given is exactly what shipped", () => {
  const shipped = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "RC-1",
    pricesIncludeTax: true,
  });
  const explicit = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "RC-1",
    pricesIncludeTax: true,
    rates: { standard: 0.055, skope: 0.03625 },
  });
  assert.deepEqual(shipped, explicit);
});

// ── The Apply link goes to the funder that quoted the figure (Steve 2026-08-20) ──
//
// The defect Steve reported: "clicking on the SKOPE funding link that appears on
// the product page takes you to the Silverchef finance application page". A
// customer may never be handed to the wrong financier.

test("a SKOPE offer applies to Skope Funding, not to SilverChef", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "SKOPE-TCE1000N",
    brand: "Skope",
    pricesIncludeTax: true,
  });
  assert.equal(offer?.funder, "skope");
  assert.equal(offer?.applyPath, "/skope-funding/apply");
  assert.notEqual(offer?.applyPath, "/silverchef/apply");
});

test("a SKOPE-BRANDED product with a silent code still applies to Skope Funding", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "BB380X-2SW",
    brand: "Skope",
    pricesIncludeTax: true,
  });
  assert.equal(offer?.funder, "skope");
  assert.equal(offer?.applyPath, "/skope-funding/apply");
});

test("every other product still applies to SilverChef", () => {
  const offer = productFinanceOffer({
    price: { displayPrice: 11000 },
    sku: "RC-54341",
    brand: "Roband",
    pricesIncludeTax: true,
  });
  assert.equal(offer?.funder, "silverchef");
  assert.equal(offer?.applyPath, "/silverchef/apply");
});

test("the apply path is the funder's, always — no third address", () => {
  assert.deepEqual(Object.keys(FINANCE_APPLY_PATH).sort(), ["silverchef", "skope"]);
  for (const path of Object.values(FINANCE_APPLY_PATH)) {
    assert.match(path, /^\/[a-z-]+\/apply$/);
  }
});

test("the Skope application offers Skope's funding types and none of SilverChef's", () => {
  const skope = financeApplyFundingTypes("skope");
  assert.ok(skope.includes(FUNDING_TYPE_SKOPE));
  assert.ok(!skope.includes(FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT));
  assert.ok(!skope.some((label) => label.startsWith("SilverChef")));
  assert.ok(skope.length > 0);
});

test("the SilverChef application keeps the whole list, as it shipped", () => {
  const silverchef = financeApplyFundingTypes("silverchef");
  assert.ok(silverchef.includes(FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT));
  assert.ok(silverchef.includes(FUNDING_TYPE_SKOPE));
  assert.ok(silverchef.length > financeApplyFundingTypes("skope").length);
});
