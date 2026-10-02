/**
 * Zoey's settings for an item a Discount Rule put in the cart (card vmO0TRBD): Allow Quantity
 * Updates (five choices), Allow Removal From Cart, the Matching QTY customization and a surcharge
 * price, carried on the line's marker; and the memory of an item the shopper took out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  rewardMarker,
  rewardSettingsOf,
  rewardQuantityAfterSync,
  rewardQuantityRefusal,
  rewardPromotionIdOf,
  declinedRewardKey,
  parseDeclinedRewards,
  serializeDeclinedRewards,
} from "./cart-offers";

test("the marker round-trips every Zoey setting and still names its promotion", () => {
  const marker = rewardMarker(187, {
    allowQty: "no_increase",
    allowRemoval: true,
    customization: { title: "Bulky Item Freight Charge", message: "For ANC-EFL-6056" },
    surchargeUnit: 25,
    addedQty: 2,
  });
  assert.equal(rewardPromotionIdOf({ applied_coupons: marker }), 187);
  assert.deepEqual(rewardSettingsOf({ applied_coupons: marker }), {
    allowQty: "no_increase",
    allowRemoval: true,
    customization: { title: "Bulky Item Freight Charge", message: "For ANC-EFL-6056" },
    surchargeUnit: 25,
    addedQty: 2,
  });
  // An older marker (card EIXdjw2s) reads as Zoey's "No" everywhere.
  assert.deepEqual(rewardSettingsOf({ applied_coupons: [{ promotion_reward: 5 }] }), {
    allowQty: "no",
    allowRemoval: false,
    customization: null,
    surchargeUnit: null,
    addedQty: null,
  });
});

test("Allow Quantity Updates: what a sync does to the shopper's quantity", () => {
  assert.equal(rewardQuantityAfterSync("no", 3, 1, false), 1);
  assert.equal(rewardQuantityAfterSync("force", 3, 1, false), 1);
  assert.equal(rewardQuantityAfterSync("yes", 3, 1, true), 3, "Yes keeps what the shopper set");
  assert.equal(rewardQuantityAfterSync("cart_only", 3, 1, false), 3, "Only from Cart keeps it on a cart change…");
  assert.equal(rewardQuantityAfterSync("cart_only", 3, 1, true), 1, "…and resets it when a product is Added to Cart");
  assert.equal(rewardQuantityAfterSync("no_increase", 3, 1, false), 1, "never above the offer's");
  assert.equal(rewardQuantityAfterSync("no_increase", 1, 3, false), 1, "a lowered quantity stays lowered");
});

test("what the shopper may do to the item by hand", () => {
  const s = (over: object) => ({ allowQty: "no" as const, allowRemoval: false, customization: null, surchargeUnit: null, addedQty: 2, ...over });
  assert.match(rewardQuantityRefusal(s({}), 2, 3) ?? "", /comes with your offer/);
  assert.match(rewardQuantityRefusal(s({}), 2, 0) ?? "", /comes with your offer/);
  assert.equal(rewardQuantityRefusal(s({ allowRemoval: true }), 2, 0), null);
  assert.equal(rewardQuantityRefusal(s({ allowQty: "yes" }), 2, 5), null);
  assert.equal(rewardQuantityRefusal(s({ allowQty: "no_increase" }), 2, 1), null);
  assert.match(rewardQuantityRefusal(s({ allowQty: "no_increase" }), 2, 3) ?? "", /not raise it/);
});

test("an item the shopper took out stays out of THAT cart only", () => {
  const key = declinedRewardKey(181, "dal-wcgrd-5l");
  assert.equal(key, "181:DAL-WCGRD-5L");
  const cookie = serializeDeclinedRewards("cart-a", [key]);
  assert.deepEqual([...parseDeclinedRewards(cookie, "cart-a")], [key]);
  assert.equal(parseDeclinedRewards(cookie, "cart-b").size, 0);
  assert.equal(parseDeclinedRewards("garbage", "cart-a").size, 0);
});
