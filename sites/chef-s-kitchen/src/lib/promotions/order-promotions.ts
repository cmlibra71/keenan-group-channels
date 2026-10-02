// ============================================================================
// WHAT AN ORDER RECORDS ABOUT ITS PROMOTIONS — `orders.metafields.promotions`.
//
// Card p6YVxc4P started this record (which offer produced which line). Card
// EIXdjw2s adds three things the promotion report and a refund need:
//
//   freight  — the QUOTED freight, what was CHARGED and what was GIVEN AWAY, ex
//              GST, and by which promotion. The header column
//              `shipping_cost_ex_tax` holds only what was charged; "freight given
//              away" is this record, to the cent.
//   rewards  — which products EARNED each Buy X Get Y reward and which TOOK it,
//              by product and SKU, so a refund of the qualifying item can claw the
//              reward back.
//   below_floor on a line — taken under its margin floor on a Manager-approved
//              promotion; the report counts them.
//
// `applied` lists the promotions that actually MOVED money on this order: a line
// discount, a coupon, or freight given away. A free-freight offer that earned
// nothing here (outside its zones, a bulky order) is not "used" by it.
//
// PURE — no database, no request. Everything it needs is handed in.
// ============================================================================

import type { FreightOutcome } from "@keenan/services";
import type { CartOffers } from "./cart-offers";

/** The cart line facts the record keeps (a subset of the cart row). */
export type OrderPromotionCartLine = {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  product_sku?: string | null;
  variant_sku?: string | null;
};

export function orderPromotionsRecord(
  offers: CartOffers,
  freight: FreightOutcome | null,
  cartLines: OrderPromotionCartLine[],
  totalDiscount: number
): Record<string, unknown> | null {
  const byId = new Map(cartLines.map((l) => [l.id, l]));
  const moved = new Set<number>();
  for (const l of offers.lines) if (l.discount > 0) moved.add(l.promotionId);
  for (const c of offers.couponDiscounts) if (c.discount > 0) moved.add(c.promotionId);
  const freightGiven = freight && freight.promotionId != null && freight.givenAwayExTax > 0;
  if (freightGiven) moved.add(freight!.promotionId as number);

  const applied = offers.appliedPromotionIds.filter((id) => moved.has(id));
  if (applied.length === 0) return null;

  const describe = (key: string) => {
    const line = byId.get(Number(key));
    if (!line) return null;
    return {
      cart_item_id: line.id,
      product_id: line.product_id,
      variant_id: line.variant_id,
      sku: line.variant_sku ?? line.product_sku ?? null,
      quantity: line.quantity,
    };
  };

  const record: Record<string, unknown> = {
    total_discount: totalDiscount.toFixed(2),
    applied,
    coupons: offers.couponDiscounts.map((c) => ({
      code: c.code,
      promotion_id: c.promotionId,
      discount: c.discount.toFixed(2),
    })),
    lines: offers.lines.map((l) => ({
      cart_item_id: l.itemId,
      promotion_id: l.promotionId,
      promotion_name: l.promotionName,
      percent: l.percent,
      discount: l.discount.toFixed(2),
      floor_clamped: l.floorClamped,
      ...(l.bundleSlug ? { bundle: l.bundleSlug } : {}),
      ...(l.reward ? { reward: true } : {}),
      ...(l.belowFloor ? { below_floor: true } : {}),
    })),
  };

  const rewards = offers.rewards
    .filter((r) => moved.has(r.promotionId))
    .map((r) => ({
      promotion_id: r.promotionId,
      promotion_name: r.promotionName,
      uses: r.uses,
      discount: r.discount.toFixed(2),
      qualifying: r.qualifyingKeys.map(describe).filter(Boolean),
      reward: r.rewardKeys.map(describe).filter(Boolean),
    }));
  if (rewards.length > 0) record.rewards = rewards;

  if (freightGiven) {
    record.freight = {
      promotion_id: freight!.promotionId,
      promotion_name: freight!.promotionName,
      label: freight!.label,
      quoted_ex_tax: freight!.quotedExTax.toFixed(2),
      charged_ex_tax: freight!.chargedExTax.toFixed(2),
      given_away_ex_tax: freight!.givenAwayExTax.toFixed(2),
      limited_by: freight!.limitedBy,
    };
  }
  return record;
}
