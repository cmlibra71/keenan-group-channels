/**
 * A coupon code is accepted when its Discount Rule does something for the cart (card vmO0TRBD):
 * money off the goods, the freight given away, or an item put in the cart. Zoey accepts all
 * three; the cart used to judge by the goods discount alone, so FREESHIPPING (free shipping
 * only) and the auto-add codes (GREEN, DETERGENT, STELLARCHEM) were refused before they could
 * ever work. Driven through the REAL engine (`evaluatePromotions`), not hand-built results.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluatePromotions, type PromotionInput, type PromotionLine } from "@keenan/services";
import { couponCodeEarns, couponCodesToRedeem, NO_OFFERS, type CartOffers } from "./cart-offers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const IK = 1;
const ALL_TRUE = { type: "combine", aggregator: "all", value: true, conditions: [] };

function coded(id: number, code: string, rules: Record<string, unknown>): PromotionInput {
  return {
    id,
    name: code,
    redemptionType: "coupon",
    couponCode: code,
    status: "enabled",
    startDate: null,
    endDate: null,
    priority: 0,
    stop: false,
    canBeCombined: true,
    maxUses: null,
    currentUses: 0,
    channelIds: [IK],
    rules: {
      type: "discount_rule",
      conditions: ALL_TRUE,
      actions: ALL_TRUE,
      simple_action: "by_percent",
      discount_amount: 0,
      ...rules,
    },
  } as PromotionInput;
}

const line = (key: string, sku: string, quantity: number, unitPrice: number, over: Partial<PromotionLine> = {}): PromotionLine =>
  ({ key, sku, quantity, unitPrice, floorUnitPrice: null, ...over }) as PromotionLine;

/** The engine's result in the cart's shape — the same fields `toOffers` copies. */
function offers(promotions: PromotionInput[], lines: PromotionLine[], couponCodes: string[]): CartOffers {
  const e = evaluatePromotions({ lines, promotions, channelId: IK, couponCodes } as Parameters<typeof evaluatePromotions>[0]);
  return {
    ...NO_OFFERS,
    lines: e.lines.map((l) => ({ itemId: Number(l.key), discount: l.discount, promotionId: l.promotionId, promotionName: l.promotionName, percent: l.percent, floorClamped: l.floorClamped })),
    totalDiscount: e.totalDiscount,
    appliedPromotionIds: e.appliedPromotionIds,
    appliedCouponCodes: e.appliedCouponCodes,
    couponDiscounts: e.couponDiscounts,
    rewardLines: e.rewardLines ?? [],
    freight: e.freight ?? null,
    rewards: e.rewards ?? [],
  };
}

const FREESHIPPING = coded(184, "FREESHIPPING", { free_shipping: "shipment" });
const STELLARCHEM = coded(188, "STELLARCHEM", {
  simple_action: "add_product",
  auto_add: { skus: "SPRAY-BOTTLE", quantity: 1, discount_percent: 100 },
  conditions: {
    type: "combine",
    aggregator: "all",
    value: true,
    conditions: [{ type: "product_found", value: true, aggregator: "all", conditions: [{ type: "product", attribute: "sku", operator: "==", value: "STELLAR-5L" }] }],
  },
});
const TENOFF = coded(185, "THANKS-MATE", { discount_amount: 10 });

test("a free-shipping-only code is accepted: it takes nothing off the goods but gives the freight away", () => {
  const lines = [line("1", "ROB-PGS605", 1, 100)];
  const before = offers([FREESHIPPING], lines, []);
  const after = offers([FREESHIPPING], lines, ["FREESHIPPING"]);
  assert.equal(after.totalDiscount, 0, "the engine gives a freight-only rule no goods discount");
  assert.equal(after.freight?.promotionId, 184);
  assert.equal(couponCodeEarns("freeshipping", before, after), true);
  // Spent on the order only when the freight was really given away (`applyFreightReward`).
  assert.deepEqual(couponCodesToRedeem(["FREESHIPPING"], after, 184), [{ code: "FREESHIPPING", discount: 0 }]);
  assert.deepEqual(couponCodesToRedeem(["FREESHIPPING"], after, null), []);
});

test("an auto-add code is accepted BEFORE its item is in the cart, and spent once it is", () => {
  const lines = [line("1", "STELLAR-5L", 1, 40)];
  const before = offers([STELLARCHEM], lines, []);
  const after = offers([STELLARCHEM], lines, ["STELLARCHEM"]);
  assert.equal(after.totalDiscount, 0, "no reward line yet, so no goods discount yet");
  assert.deepEqual(after.rewardLines.map((r) => [r.promotionId, r.sku, r.quantity]), [[188, "SPRAY-BOTTLE", 1]]);
  assert.equal(couponCodeEarns("STELLARCHEM", before, after), true);
  // After the sync adds the bottle the code takes its price off it — the ordinary path.
  const synced = offers([STELLARCHEM], [...lines, line("2", "SPRAY-BOTTLE", 1, 6.5, { rewardPromotionId: 188 })], ["STELLARCHEM"]);
  assert.equal(synced.totalDiscount, 6.5);
  assert.deepEqual(couponCodesToRedeem(["STELLARCHEM"], synced, null), [{ code: "STELLARCHEM", discount: 6.5 }]);
});

test("a code that does nothing for this cart is still refused, and so is one that makes it worse", () => {
  const noBottle = [line("1", "OTHER", 1, 40)];
  assert.equal(couponCodeEarns("STELLARCHEM", offers([STELLARCHEM], noBottle, []), offers([STELLARCHEM], noBottle, ["STELLARCHEM"])), false);
  assert.equal(couponCodeEarns("NOPE", NO_OFFERS, NO_OFFERS), false);
  assert.deepEqual(couponCodesToRedeem(["STELLARCHEM"], offers([STELLARCHEM], noBottle, ["STELLARCHEM"]), null), []);
  // Same freight, less money off: refused.
  const worse: CartOffers = { ...NO_OFFERS, totalDiscount: 5, appliedCouponCodes: ["X"], couponDiscounts: [{ code: "X", promotionId: 9, discount: 0 }], freight: { promotionId: 9 } as CartOffers["freight"] };
  assert.equal(couponCodeEarns("X", { ...NO_OFFERS, totalDiscount: 10 }, worse), false);
});

test("a plain percentage code still works exactly as before", () => {
  const lines = [line("1", "ROB-Z11150", 2, 50)];
  const before = offers([TENOFF], lines, []);
  const after = offers([TENOFF], lines, ["THANKS-MATE"]);
  assert.equal(after.totalDiscount, 10);
  assert.equal(couponCodeEarns("thanks-mate", before, after), true);
  assert.deepEqual(couponCodesToRedeem(["THANKS-MATE", "thanks-mate"], after, null), [{ code: "THANKS-MATE", discount: 10 }]);
});

test("the cart's coupon box and placeOrder's redemption both go through these two judgements", () => {
  const cart = read("../actions/cart.ts");
  assert.match(cart, /if \(!couponCodeEarns\(code, before, after\)\)/);
  assert.doesNotMatch(cart, /after\.totalDiscount <= before\.totalDiscount/);
  const checkout = read("../actions/checkout.ts");
  assert.match(checkout, /couponCodesToRedeem\(\s*couponCodesOnCart,\s*cartOffers,/);
});
