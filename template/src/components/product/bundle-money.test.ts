import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleMoney, type BundleMoneyPurchase } from "./bundle-money.ts";

const purchase = (over: Partial<BundleMoneyPurchase> = {}): BundleMoneyPurchase => ({
  hidePrice: false,
  displayPrice: 7700.99,
  displaySalePrice: null,
  activeMemberPrice: null,
  restrictAddToCart: false,
  purchaseBlockedByStock: false,
  ...over,
});

test("a priced build states the page's own headline and says the cart takes it line by line", () => {
  assert.deepEqual(bundleMoney({ purchase: purchase(), total: 1984.25 }), {
    showPrices: true,
    configured: 7700.99,
    cartOffered: true,
  });
});

test("the configured price is the lower member / contract price when there is one, as the headline chooses", () => {
  assert.equal(bundleMoney({ purchase: purchase({ activeMemberPrice: 7000 }), total: 1 }).configured, 7000);
  assert.equal(bundleMoney({ purchase: purchase({ activeMemberPrice: 9000 }), total: 1 }).configured, 7700.99);
  assert.equal(bundleMoney({ purchase: purchase({ displaySalePrice: 7500 }), total: 1 }).configured, 7500);
});

test("a hidden price hides every price in the picker", () => {
  assert.deepEqual(bundleMoney({ purchase: purchase({ hidePrice: true }), total: 1984.25 }), {
    showPrices: false,
    configured: null,
    cartOffered: false,
  });
});

test("a chosen part with no price online states no total — never a total short a part", () => {
  assert.deepEqual(bundleMoney({ purchase: purchase(), total: null }), {
    showPrices: true,
    configured: null,
    cartOffered: false,
  });
});

test("a build at $0 states nothing", () => {
  assert.equal(bundleMoney({ purchase: purchase({ displayPrice: 0 }), total: 0 }).configured, null);
});

test("the cart sentence is not said where the cart is not offered", () => {
  assert.equal(bundleMoney({ purchase: purchase({ restrictAddToCart: true }), total: 5 }).cartOffered, false);
  assert.equal(bundleMoney({ purchase: purchase({ purchaseBlockedByStock: true }), total: 5 }).cartOffered, false);
});

test("outside a purchase provider there is nothing to say about money", () => {
  assert.deepEqual(bundleMoney({ purchase: null, total: 5 }), { showPrices: false, configured: null, cartOffered: false });
});
