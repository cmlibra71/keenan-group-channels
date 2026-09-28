import { test } from "node:test";
import assert from "node:assert/strict";
import { chargedUnitPrice, onlineOrderingOff, refuseOnlinePurchase } from "./online-purchase.ts";
import { CART_RESTRICTED_ERROR } from "./restricted-message.ts";

test("an ordinary priced product may be bought online", () => {
  assert.equal(refuseOnlinePurchase({}, 2514.68), null);
  assert.equal(refuseOnlinePurchase(null, 10), null);
  assert.equal(
    refuseOnlinePurchase(
      { restrictAddToCart: false, purchasingDisabled: false, hidePrice: false, variantPurchasingDisabled: false },
      10
    ),
    null
  );
});

test("each quote-only flag refuses the add with the cart's own sentence", () => {
  for (const flags of [
    { restrictAddToCart: true },
    { purchasingDisabled: true },
    { hidePrice: true },
    { variantPurchasingDisabled: true },
  ]) {
    assert.equal(refuseOnlinePurchase(flags, 999), CART_RESTRICTED_ERROR, JSON.stringify(flags));
    assert.equal(onlineOrderingOff(flags), true);
  }
});

test("a Zoey quote-only product is refused with the page's own sentence", () => {
  assert.equal(refuseOnlinePurchase({}, 999, "This item is available by quote only"), "This item is available by quote only");
  assert.equal(refuseOnlinePurchase({ purchasingDisabled: true }, 999, "Call us for a price"), "Call us for a price");
  // No message (purchasing on) falls through to the other rules.
  assert.equal(refuseOnlinePurchase({}, 999, null), null);
  assert.equal(refuseOnlinePurchase({}, 999, "  "), null);
});

test("a product with no price sells by quote only — $0, negative, blank or NaN", () => {
  for (const price of [0, -1, NaN, null, undefined]) {
    assert.equal(refuseOnlinePurchase({}, price as number), CART_RESTRICTED_ERROR, String(price));
  }
});

test("the charged unit is the sale price when there is one, else the list price", () => {
  assert.equal(chargedUnitPrice({ listPrice: "3996.0000", salePrice: "2514.6800" }), 2514.68);
  assert.equal(chargedUnitPrice({ listPrice: "3996.0000", salePrice: null }), 3996);
  assert.equal(chargedUnitPrice({ listPrice: "0.0000", salePrice: null }), 0);
  assert.equal(chargedUnitPrice({ listPrice: "abc", salePrice: "" }), 0);
});

test("unflagged facts do not switch online ordering off", () => {
  assert.equal(onlineOrderingOff(null), false);
  assert.equal(onlineOrderingOff({ restrictAddToCart: false, purchasingDisabled: null }), false);
});

// Wiring: the refusal only matters if the server actions actually call it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..");

test("addToCart refuses quote-only products BEFORE the extras are priced on", () => {
  const src = readFileSync(join(LIB, "actions/cart.ts"), "utf8");
  const refuse = src.indexOf("refuseOnlinePurchase(");
  const surcharge = src.indexOf("withAddonSurcharge(basePricing");
  assert.ok(refuse > 0, "addToCart calls refuseOnlinePurchase");
  assert.ok(surcharge > refuse, "the refusal is judged on the price before extras");
  assert.match(src, /if \(onlineOrderingOff\(facts\)\) return CART_RESTRICTED_ERROR;/);
  // Product OR variant quote-only, through the services helper.
  assert.match(src, /purchasingDisabledMessage\(facts, variantRow\)/);
  // The cart charges the page's catalogue price.
  assert.match(src, /catalogLinePrices\(product, variant\)/);
});

test("placeOrder refuses a line whose product is quote-only", () => {
  const src = readFileSync(join(LIB, "actions/checkout.ts"), "utf8");
  assert.match(src, /lines\.find\(\(i\) => onlineOrderingOff\(stock\.get\(i\.product_id\)\)\)/);
});

test("the facts read carries both quote-only switches", () => {
  const src = readFileSync(join(LIB, "cart/backorder-facts.ts"), "utf8");
  assert.match(src, /purchasing_disabled, purchasing_disabled_message, hide_price/);
});
