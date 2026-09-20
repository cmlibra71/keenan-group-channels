// ============================================================================
// CART OFFERS — the storefront's half of the shared promotion engine.
//
// One function, called from three places that must agree to the cent:
//   - the /cart page (what the shopper is shown),
//   - the /checkout page (what the shopper is shown one step later),
//   - placeOrder (what we actually bill).
//
// The arithmetic lives in @keenan/services (`evaluateBasketPromotions`), which
// the portal's quote builder calls too — so an offer made by the Orders team on
// a call and the same offer taken online cannot come out at two different
// numbers (card p6YVxc4P).
//
// TAX BASIS: cart prices are stored in the channel's own basis and neither live
// channel sets `prices_include_tax`, so they are ex-GST today. The basis is
// passed through rather than assumed, because the floor clamp has to be compared
// in the same basis or a GST-inclusive channel would clamp ~10% too high.
//
// NEVER THROWS. A promotion that cannot be read leaves the basket at full price;
// nothing about a shopper's ability to buy depends on an offer resolving.
// ============================================================================

import {
  couponService,
  evaluateBasketPromotions,
  loadCouponCustomerUses,
  type PromotionEvaluation,
} from "@keenan/services";

/** The cart-line shape this module needs (a subset of cartService.getWithItems). */
export type OfferCartLine = {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  list_price: string | null;
  sale_price: string | null;
  product_sku: string | null;
  variant_sku?: string | null;
};

/** What one line took, as the cart, the checkout and the order all read it. */
export type CartLineOffer = {
  /** cart_items.id */
  itemId: number;
  /** Total discount for the line, in the cart's tax basis, 2dp. */
  discount: number;
  promotionId: number;
  promotionName: string;
  percent: number;
  floorClamped: boolean;
  bundleSlug?: string;
};

export type CartOffers = {
  lines: CartLineOffer[];
  /** Σ of the line discounts. */
  totalDiscount: number;
  /** Shopper-facing sentences: how many more cartons, request-a-quote, etc. */
  messages: { kind: string; text: string }[];
  appliedPromotionIds: number[];
  appliedCouponCodes: string[];
  /** What each applied coupon took off, so the redemption records a real amount. */
  couponDiscounts: { code: string; promotionId: number; discount: number }[];
};

export const NO_OFFERS: CartOffers = {
  lines: [],
  totalDiscount: 0,
  messages: [],
  appliedPromotionIds: [],
  appliedCouponCodes: [],
  couponDiscounts: [],
};

/** The SKU actually being sold on this line: the variant's own where it has one. */
export function lineSku(item: OfferCartLine): string | null {
  return item.variant_sku ?? item.product_sku ?? null;
}

/** The effective per-unit charge before promotions — the same rule as the order draft. */
export function lineUnitCharge(item: OfferCartLine): number {
  const sale = item.sale_price ? parseFloat(item.sale_price) : NaN;
  if (Number.isFinite(sale)) return sale;
  const list = item.list_price ? parseFloat(item.list_price) : NaN;
  return Number.isFinite(list) ? list : 0;
}

function toOffers(evaluation: PromotionEvaluation): CartOffers {
  return {
    lines: evaluation.lines.map((l) => ({
      itemId: Number(l.key),
      discount: l.discount,
      promotionId: l.promotionId,
      promotionName: l.promotionName,
      percent: l.percent,
      floorClamped: l.floorClamped,
      ...(l.bundleSlug ? { bundleSlug: l.bundleSlug } : {}),
    })),
    totalDiscount: evaluation.totalDiscount,
    messages: evaluation.messages.map((m) => ({ kind: m.kind, text: m.text })),
    appliedPromotionIds: evaluation.appliedPromotionIds,
    appliedCouponCodes: evaluation.appliedCouponCodes,
    couponDiscounts: evaluation.couponDiscounts,
  };
}

/**
 * Evaluate this channel's live promotions against a cart's lines.
 *
 * `channelId` is the storefront's own; `couponCodes` are whatever the cart is
 * carrying. A basket with no lines, or a channel with no live promotions, comes
 * back as NO_OFFERS without touching the database twice.
 */
export async function resolveCartOffers(
  items: OfferCartLine[],
  options: {
    channelId: number;
    couponCodes?: string[];
    pricesIncludeTax?: boolean;
    /**
     * WHO is buying. A coupon's `max_uses_per_customer` is judged against this
     * shopper's live redemptions before any discount is shown, so the cart
     * refuses a code the till would refuse (card p6YVxc4P, requirement 5). A
     * guest has no contact, so only the total cap can bind for them — which is
     * the position a guest checkout is in anyway.
     */
    contactId?: number | null;
  }
): Promise<CartOffers> {
  if (!items || items.length === 0) return NO_OFFERS;
  try {
    const evaluation = await evaluateBasketPromotions(
      items.map((item) => ({
        key: String(item.id),
        productId: item.product_id,
        variantId: item.variant_id,
        sku: lineSku(item),
        quantity: item.quantity,
        unitPrice: lineUnitCharge(item),
      })),
      {
        channelId: options.channelId,
        couponCodes: options.couponCodes ?? [],
        taxInclusive: options.pricesIncludeTax === true,
        contactId: options.contactId ?? null,
      }
    );
    return toOffers(evaluation);
  } catch (e) {
    console.error("[cart-offers] promotion evaluation failed (non-fatal):", e);
    return NO_OFFERS;
  }
}

/**
 * Why a code is being refused, in the shopper's words — or null when the caps
 * are not the reason.
 *
 * The caps themselves are enforced twice over: `evaluateBasketPromotions` reads
 * them so the discount is never SHOWN to somebody who cannot have it, and
 * `CouponService.redeem` re-reads them under a row lock so two tabs cannot both
 * spend the last use. This exists only so the refusal says something true —
 * "you've already used that code" rather than "that code doesn't apply to what's
 * in your cart", which would send the shopper looking at their basket for a
 * problem that is not there.
 */
export async function couponCapRefusal(
  code: string,
  who: { contactId?: number | null; customerId?: number | null }
): Promise<string | null> {
  try {
    const coupon = (await couponService.getByCode(code)) as
      | {
          id: number;
          max_uses: number | null;
          current_uses: number | null;
          max_uses_per_customer: number | null;
        }
      | null;
    // An unknown code is not a cap problem; the caller's own wording is right.
    if (!coupon) return null;
    if (coupon.max_uses != null && (coupon.current_uses ?? 0) >= coupon.max_uses) {
      return "That code has been fully redeemed.";
    }
    if (
      coupon.max_uses_per_customer != null &&
      (who.contactId != null || who.customerId != null)
    ) {
      const uses = await loadCouponCustomerUses([coupon.id], who);
      if ((uses.get(coupon.id) ?? 0) >= coupon.max_uses_per_customer) {
        return "You've already used that code.";
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Discounts keyed by cart_items.id, for a caller that only needs the money. */
export function offersByItemId(offers: CartOffers): Map<number, CartLineOffer> {
  const out = new Map<number, CartLineOffer>();
  for (const line of offers.lines) out.set(line.itemId, line);
  return out;
}
