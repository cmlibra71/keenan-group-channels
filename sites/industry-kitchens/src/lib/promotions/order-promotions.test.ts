import { test } from "node:test";
import assert from "node:assert/strict";
import { orderPromotionsRecord } from "./order-promotions.ts";
import type { CartOffers } from "./cart-offers.ts";

const lines = [
  { id: 11, product_id: 1, variant_id: null, quantity: 1, product_sku: "A-1" },
  { id: 12, product_id: 2, variant_id: null, quantity: 1, product_sku: "SKU-B" },
];

function offers(over: Partial<CartOffers> = {}): CartOffers {
  return {
    lines: [],
    totalDiscount: 0,
    messages: [],
    appliedPromotionIds: [],
    appliedCouponCodes: [],
    couponDiscounts: [],
    rewardLines: [],
    freight: null,
    rewards: [],
    ...over,
  };
}

test("a Buy X Get Y order records what earned the reward and what took it", () => {
  const record = orderPromotionsRecord(
    offers({
      lines: [{ itemId: 12, discount: 40, promotionId: 7, promotionName: "Free trolley", percent: 100, floorClamped: false, reward: true, belowFloor: true }],
      totalDiscount: 40,
      appliedPromotionIds: [7],
      rewards: [{ promotionId: 7, promotionName: "Free trolley", uses: 1, qualifyingKeys: ["11"], rewardKeys: ["12"], discount: 40, freight: false }],
    }),
    null,
    lines,
    40
  );
  assert.ok(record);
  assert.deepEqual(record.applied, [7]);
  const reward = (record.rewards as Record<string, unknown>[])[0];
  assert.deepEqual((reward.qualifying as { sku: string }[]).map((q) => q.sku), ["A-1"]);
  assert.deepEqual((reward.reward as { sku: string }[]).map((q) => q.sku), ["SKU-B"]);
  const line = (record.lines as Record<string, unknown>[])[0];
  assert.equal(line.reward, true);
  assert.equal(line.below_floor, true);
  assert.equal(record.freight, undefined);
});

test("freight given away is recorded to the cent, quoted beside charged", () => {
  const record = orderPromotionsRecord(
    offers({ appliedPromotionIds: [8] }),
    {
      chargedExTax: 0,
      quotedExTax: 154.68,
      givenAwayExTax: 154.68,
      promotionId: 8,
      promotionName: "Free freight over $500",
      label: "Free freight over $500",
      limitedBy: null,
    },
    lines,
    0
  );
  assert.deepEqual(record?.applied, [8]);
  assert.deepEqual(record?.freight, {
    promotion_id: 8,
    promotion_name: "Free freight over $500",
    label: "Free freight over $500",
    quoted_ex_tax: "154.68",
    charged_ex_tax: "0.00",
    given_away_ex_tax: "154.68",
    limited_by: null,
  });
});

test("a freight offer that gave nothing (bulky order, other zone) is not 'used' by the order", () => {
  assert.equal(orderPromotionsRecord(offers({ appliedPromotionIds: [8] }), null, lines, 0), null);
});
