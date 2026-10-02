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
  type DiscountRuleAddress,
  type FreightGrant,
  resolveOrderPricingGroupId,
  type PromotionEvaluation,
  type RewardRecord,
} from "@keenan/services";
import { addonSurcharge, readStoredAddons } from "@keenan/services/product-addons";

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
  /**
   * `cart_items.applied_coupons`. A Buy X Get Y reward line the cart added itself carries
   * `[{ promotion_reward: <promotion id> }]` here (card EIXdjw2s) — see `rewardPromotionIdOf`.
   */
  applied_coupons?: unknown;
  /** The line's paid add-ons (warranty, install…), whose price is already inside `sale_price`. */
  modifier_selections?: unknown;
};

/**
 * The promotion that PUT this line in the cart (Zoey's "Automatically Add Product To Cart"), or
 * null for a line the shopper added. Read from `cart_items.applied_coupons`, a jsonb column the
 * schema has always carried and nothing else writes.
 */
export function rewardPromotionIdOf(item: { applied_coupons?: unknown }): number | null {
  const raw = item.applied_coupons;
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = Number((entry as { promotion_reward?: unknown }).promotion_reward);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

/**
 * Zoey's per-rule settings for the item a Discount Rule added (card vmO0TRBD): Allow Quantity
 * Updates, Allow Removal From Cart, the Matching QTY Customization Title / Message and — in
 * surcharge mode — the price it is charged. Stored on the line's own marker, so the cart row, the
 * quantity buttons and the sync all read the same settings without another query.
 */
export interface RewardLineSettings {
  allowQty: "yes" | "cart_only" | "no_increase" | "no" | "force";
  allowRemoval: boolean;
  customization: { title: string; message: string } | null;
  /** Surcharge mode: the per-unit price, in the cart's basis. */
  surchargeUnit: number | null;
  /** How many the offer put there — "Yes - But Prohibit Qty Increases" never goes above it. */
  addedQty: number | null;
}

/** The `applied_coupons` value that marks a line as this promotion's reward. */
export function rewardMarker(
  promotionId: number,
  settings?: Partial<RewardLineSettings> | null
): Array<{ promotion_reward: number } & Record<string, unknown>> {
  const s = settings ?? {};
  return [
    {
      promotion_reward: promotionId,
      ...(s.allowQty && s.allowQty !== "no" ? { allow_qty: s.allowQty } : {}),
      ...(s.allowRemoval ? { allow_removal: true } : {}),
      ...(s.customization ? { customization: s.customization } : {}),
      ...(s.surchargeUnit != null ? { surcharge_unit: s.surchargeUnit } : {}),
      ...(s.addedQty != null ? { added_qty: s.addedQty } : {}),
    },
  ];
}

/** The settings a reward line's marker carries (defaults = Zoey's "No" everywhere). PURE. */
export function rewardSettingsOf(item: { applied_coupons?: unknown }): RewardLineSettings {
  const out: RewardLineSettings = { allowQty: "no", allowRemoval: false, customization: null, surchargeUnit: null, addedQty: null };
  const raw = item.applied_coupons;
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (!(Number(e.promotion_reward) > 0)) continue;
    if (["yes", "cart_only", "no_increase", "force"].includes(String(e.allow_qty))) out.allowQty = e.allow_qty as RewardLineSettings["allowQty"];
    out.allowRemoval = e.allow_removal === true;
    const c = e.customization as { title?: unknown; message?: unknown } | null;
    if (c && typeof c === "object") out.customization = { title: String(c.title ?? ""), message: String(c.message ?? "") };
    const su = Number(e.surcharge_unit);
    out.surchargeUnit = Number.isFinite(su) && su >= 0 && e.surcharge_unit != null ? su : null;
    const aq = Number(e.added_qty);
    out.addedQty = Number.isInteger(aq) && aq > 0 ? aq : null;
  }
  return out;
}

/**
 * The quantity a held reward line should have after a sync, by Zoey's Allow Quantity Updates
 * (card vmO0TRBD): "No" and "No - Always force…" hold the offer's quantity; "Yes" keeps whatever the
 * shopper set; "Yes - But Only from Cart" keeps it except when a product is being Added to Cart,
 * which resets it; "Yes - But Prohibit Qty Increases" keeps it but never above the offer's. PURE.
 */
export function rewardQuantityAfterSync(
  allowQty: RewardLineSettings["allowQty"],
  current: number,
  wanted: number,
  fromAdd: boolean
): number {
  switch (allowQty) {
    case "yes":
      return current;
    case "cart_only":
      return fromAdd ? wanted : current;
    case "no_increase":
      return Math.min(current, wanted);
    default:
      return wanted;
  }
}

/** May the shopper change a reward line's quantity to `next`? Null = yes, else the reason. PURE. */
export function rewardQuantityRefusal(settings: RewardLineSettings, current: number, next: number): string | null {
  if (next <= 0) return settings.allowRemoval ? null : REWARD_LINE_LOCKED_TEXT;
  if (settings.allowQty === "no" || settings.allowQty === "force") return REWARD_LINE_LOCKED_TEXT;
  if (settings.allowQty === "no_increase" && next > Math.max(current, settings.addedQty ?? current)) {
    return "This item comes with your offer — you can lower its quantity, but not raise it.";
  }
  return null;
}

export const REWARD_LINE_LOCKED_TEXT =
  "This item comes with your offer. It is added and removed automatically with the items that earn it.";

/**
 * A reward the shopper took out of the cart (Allow Removal From Cart = Yes) must not come straight
 * back on the next read — Zoey remembers it for the cart. The cart rows have nowhere to keep that,
 * so it rides a cookie beside the cart's own (`cart_uuid`): `<cart uuid>|<promotion id>:<SKU>,…`.
 * A different cart (a new uuid) starts with nothing declined. PURE helpers; the cookie I/O is in
 * `cart.ts`.
 */
export const DECLINED_REWARDS_COOKIE = "declined_rewards";
export function declinedRewardKey(promotionId: number, sku: string): string {
  return `${promotionId}:${sku.toUpperCase()}`;
}
export function parseDeclinedRewards(value: string | null | undefined, cartUuid: string | null | undefined): Set<string> {
  if (!value || !cartUuid) return new Set();
  const [uuid, list] = value.split("|");
  if (uuid !== cartUuid || !list) return new Set();
  return new Set(list.split(",").map((k) => k.trim()).filter((k) => /^\d+:[A-Z0-9][A-Z0-9._\-/ ]*$/.test(k)));
}
export function serializeDeclinedRewards(cartUuid: string, keys: Iterable<string>): string {
  return `${cartUuid}|${[...new Set(keys)].slice(0, 50).join(",")}`;
}
/** Coupon codes as the engine reads them (kept as a seam; codes are passed through unchanged). */
export function visibleCouponCodes(codes: readonly string[] | null | undefined): string[] {
  return [...(codes ?? [])];
}

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
  /** A Buy X Get Y reward line (the free or discounted item). */
  reward?: boolean;
  /** Taken under its margin floor on a Manager-approved promotion. */
  belowFloor?: boolean;
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
  /** Reward lines the cart should hold (card EIXdjw2s) — `syncCartPromotionRewards` reads it. */
  rewardLines: PromotionEvaluation["rewardLines"];
  /** A freight reward this basket earned; the checkout applies it (`applyFreightReward`). */
  freight: FreightGrant | null;
  /** Which lines earned and took each Buy X Get Y reward, for the order's record. */
  rewards: RewardRecord[];
  /**
   * A Discount Rule set to Free Shipping = "Do not allow free shipping method" applied (card
   * vmO0TRBD): the checkout offers no free delivery for this cart.
   */
  freeShippingBlocked?: boolean;
};

export const NO_OFFERS: CartOffers = {
  lines: [],
  totalDiscount: 0,
  messages: [],
  appliedPromotionIds: [],
  appliedCouponCodes: [],
  couponDiscounts: [],
  rewardLines: [],
  freight: null,
  rewards: [],
};

/**
 * WHAT A COUPON CODE EARNS IN THIS BASKET (card vmO0TRBD). Zoey accepts a code whose rule does
 * something for the cart, and a Discount Rule can do three things: take money off the goods, give
 * the delivery away (Free Shipping / Apply to Shipping Amount) or put an item in the cart
 * (Automatically Add Product to Cart). Judging by the goods discount alone refused the last two —
 * FREESHIPPING, GREEN, DETERGENT and STELLARCHEM were told "That code doesn't apply to what's in
 * your cart" before their item or their freight could ever count. The engine lists a code in
 * `appliedCouponCodes` only when its rule moved money, earned the freight or added an item; this
 * also asks that the code made the basket BETTER than it was without it, and never worse (one
 * discount code per order, so a code can displace an earlier one). Pure.
 */
export function couponCodeEarns(code: string, before: CartOffers, after: CartOffers): boolean {
  const wanted = (code ?? "").trim().toUpperCase();
  if (!wanted || !after.appliedCouponCodes.includes(wanted)) return false;
  if (after.totalDiscount > before.totalDiscount + 1e-9) return true;
  if (after.totalDiscount < before.totalDiscount - 1e-9) return false;
  const promotionIds = new Set(
    after.couponDiscounts.filter((c) => c.code.toUpperCase() === wanted).map((c) => c.promotionId)
  );
  if (promotionIds.size === 0) return false;
  const freightNow = after.freight != null && promotionIds.has(after.freight.promotionId);
  const freightBefore = before.freight != null && promotionIds.has(before.freight.promotionId);
  if (freightNow && !freightBefore) return true;
  return after.rewardLines.some((r) => promotionIds.has(r.promotionId) && r.quantity > 0);
}

/**
 * The codes an order REDEEMS (card vmO0TRBD, narrowing p6YVxc4P's "a code that discounts nothing
 * is not redeemed"): a code is spent when its rule took money off the goods, when its rule's
 * freight was actually given away on this order (`freightPromotionId`, from `applyFreightReward`),
 * or when its rule put an item in the cart. A code that did none of those stays usable rather than
 * being burnt. Each keeps the goods discount it took (0 for freight or an added item), which is
 * the amount the redemption records. Pure.
 */
export function couponCodesToRedeem(
  codesOnCart: string[],
  offers: CartOffers,
  freightPromotionId: number | null
): { code: string; discount: number }[] {
  const out: { code: string; discount: number }[] = [];
  const seen = new Set<string>();
  for (const raw of codesOnCart) {
    const code = (raw ?? "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const rows = offers.couponDiscounts.filter((c) => c.code.toUpperCase() === code);
    const discount = rows.reduce((sum, c) => sum + c.discount, 0);
    const ids = new Set(rows.map((c) => c.promotionId));
    const earned =
      discount > 0 ||
      (freightPromotionId != null && ids.has(freightPromotionId)) ||
      offers.rewardLines.some((r) => ids.has(r.promotionId) && r.quantity > 0);
    if (earned) out.push({ code, discount: Math.round(discount * 100) / 100 });
  }
  return out;
}

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

/**
 * The per-unit price an OFFER may discount: the charge LESS the line's paid add-ons.
 *
 * `withAddonSurcharge` puts the add-ons' price inside `sale_price` / `list_price`, and the whole
 * figure used to go to the engine — so a percentage came off the warranty and the installation
 * too, and the add-ons' price counted as room above a floor that was built from the machine's cost
 * alone, letting the machine itself go under its floor unclamped. Offers are on products; the
 * extras are charged in full, the same rule the bulk break follows (`cart.ts`). The order line
 * still charges the full price: the discount is an absolute amount taken off it.
 * (Card p6YVxc4P, round 4.)
 */
export function lineOfferBase(item: OfferCartLine): number {
  const extras = addonSurcharge(readStoredAddons(item.modifier_selections as never));
  return Math.max(0, lineUnitCharge(item) - (Number.isFinite(extras) ? extras : 0));
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
      ...(l.reward ? { reward: true } : {}),
      ...(l.belowFloor ? { belowFloor: true } : {}),
    })),
    totalDiscount: evaluation.totalDiscount,
    messages: evaluation.messages.map((m) => ({ kind: m.kind, text: m.text })),
    appliedPromotionIds: evaluation.appliedPromotionIds,
    appliedCouponCodes: evaluation.appliedCouponCodes,
    couponDiscounts: evaluation.couponDiscounts,
    rewardLines: evaluation.rewardLines ?? [],
    freight: evaluation.freight ?? null,
    rewards: evaluation.rewards ?? [],
    ...(evaluation.freeShippingBlocked ? { freeShippingBlocked: true } : {}),
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
     * guest has no contact, so they are matched by their billing email instead
     * (`email`, normalised the way guest orders are).
     */
    contactId?: number | null;
    /**
     * The shopper's trade ACCOUNT, when they have one. It resolves their customer group, and a Buy
     * X Get Y offer limited to accounts, or capped at one use per account, is judged against it
     * (card EIXdjw2s). A signed-in Industry Kitchens account buys on its negotiated prices, which
     * such an offer only sits on top of when it says it combines with trade pricing.
     */
    accountId?: number | null;
    /** The buyer's email — a guest's identity for a coupon's per-customer cap. */
    email?: string | null;
    /**
     * The shopper's customer group. Left out, it is resolved exactly as an order is stamped
     * (`resolveOrderPricingGroupId`: account → contact → the channel's guest tier), so an offer
     * limited to customer groups reaches the customers it names and nobody else.
     */
    customerGroupId?: number | null;
    /**
     * The delivery and payment the checkout knows (card vmO0TRBD): a Discount Rule's Shipping
     * Postcode / State / Country, Delivery Method and Payment Method conditions read it. The cart
     * page has none yet, so those conditions read empty there — as on a Zoey cart before checkout.
     */
    address?: DiscountRuleAddress | null;
    /** Which of IK's store views the shopper is on (the GST toggle) — picks the rule's label. */
    labelView?: "ex_gst" | "inc_gst" | null;
  }
): Promise<CartOffers> {
  if (!items || items.length === 0) return NO_OFFERS;
  try {
    const customerGroupId =
      options.customerGroupId !== undefined
        ? options.customerGroupId
        : await resolveOrderPricingGroupId({
            channelId: options.channelId,
            accountId: options.accountId ?? null,
            contactId: options.contactId ?? null,
          });
    const evaluation = await evaluateBasketPromotions(
      items.map((item) => ({
        key: String(item.id),
        productId: item.product_id,
        variantId: item.variant_id,
        sku: lineSku(item),
        quantity: item.quantity,
        unitPrice: lineOfferBase(item),
        rewardPromotionId: rewardPromotionIdOf(item),
      })),
      {
        channelId: options.channelId,
        couponCodes: visibleCouponCodes(options.couponCodes),
        taxInclusive: options.pricesIncludeTax === true,
        contactId: options.contactId ?? null,
        email: options.email ?? null,
        customerGroupId,
        accountId: options.accountId ?? null,
        pricing: { trade: options.accountId != null },
        context: "storefront",
        address: options.address ?? null,
        labelView: options.labelView ?? null,
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
  who: { contactId?: number | null; customerId?: number | null; email?: string | null }
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
    // Live uses (non-cancelled orders), the same count the cart and the till judge by.
    if (coupon.max_uses != null && (await couponService.countLiveRedemptions(coupon.id)) >= coupon.max_uses) {
      return "That code has been fully redeemed.";
    }
    if (
      coupon.max_uses_per_customer != null &&
      (who.contactId != null || who.customerId != null || !!who.email)
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
