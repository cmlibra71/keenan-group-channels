// ============================================================================
// May this product be put in the CART at all? — the server-side answer.
//
// Root cause "cart add action rejects purchasing-disabled products" (IK parity
// audit, 2026-09-28). The product page hides Add to Cart for a product staff set
// to quote-only, but `addToCart` only ever refused `restrict_add_to_cart`, so a
// listing tile, a stale tab or a hand-posted server action could still put a
// quote-only machine in the basket at whatever price the row carried — including
// $0. The Product Brief's rule is that a refusal lives in the action, not only in
// the page. These are the four ways a product is "quote only" today:
//
//   * `restrict_add_to_cart`   — staff switched Add to Cart off (card 7vu2iEEZ);
//   * `purchasing_disabled`    — Zoey's "available by quote only" flag, on the
//                                product (815 visible products) or the chosen
//                                variant;
//   * `hide_price`             — a hidden price behaves exactly like no price
//                                (the purchase provider masks it to 0);
//   * a price of zero          — `hasPrice` is `(salePrice ?? price) > 0`
//                                everywhere, and a $0 product sells by quote only
//                                (`sf-product-page`: "Call for Price" + Add to Quote).
//
// A Zoey "quote only" product (product or variant) is refused with the sentence the product page
// shows for it — the staff message, else "This item is available by quote only" — which the caller
// resolves with services `purchasingDisabledMessage` and passes in. Every other refusal is the
// sentence the cart already shows for a restricted line (`CART_RESTRICTED_ERROR`), because it says
// what to do instead: add it to a quote.
//
// THIS storefront's Zoey rules (`metafields.zoey_channel_rules[CHANNEL_ID]`, portal PR #1028) are
// the fifth way: zero-price (`quote_only`) and Zoey out-of-stock refuse the cart for everyone, and
// `guest_quote_only` refuses it for a GUEST — a signed-in customer buys as before. They refuse with
// the restricted-line sentence (it says "add it to a quote", and no stock wording — card CXnP1lrL).
// Only the guest rule needs to know who is asking (`viewer`); a caller that cannot say is treated as
// a guest, which can only refuse a guest-restricted product, never admit one. A product with no rules
// for this channel (every product until the backfill runs; every Chefs Depot product) is unaffected.
//
// Pure, so the rules are unit-tested (`online-purchase.test.ts`). Listed in
// `orchestrator/shared-modules.json`: both storefronts refuse word for word.
// ============================================================================

import { channelRulesRefuseCart, type ChannelPurchaseRules, type ChannelRuleViewer } from "@keenan/services/channel-rules";
import { canPurchaseQuantity, type StockFacts } from "@keenan/services/backorder";
import { CART_RESTRICTED_ERROR } from "./restricted-message";

export interface OnlinePurchaseFlags {
  restrictAddToCart?: boolean | null;
  purchasingDisabled?: boolean | null;
  hidePrice?: boolean | null;
  /** The chosen variant's own `purchasing_disabled`. */
  variantPurchasingDisabled?: boolean | null;
  /** This storefront's Zoey rules (`lib/cart/backorder-facts.ts`); null/absent = none. */
  channelRules?: ChannelPurchaseRules | null;
}

/** Who is buying — only the guest quote-only rule reads it. */
export type OnlinePurchaseViewer = ChannelRuleViewer;

/**
 * Staff switched this product off for online ordering, whatever it costs. Used for a
 * cart LINE too (the row marks itself and refuses an increase), where the price
 * is not re-read.
 */
export function onlineOrderingOff(
  flags: OnlinePurchaseFlags | null | undefined,
  /** Who is buying — omitted reads as a guest (see the header). */
  viewer?: OnlinePurchaseViewer | null
): boolean {
  if (!flags) return false;
  return (
    flags.restrictAddToCart === true ||
    flags.purchasingDisabled === true ||
    flags.hidePrice === true ||
    flags.variantPurchasingDisabled === true ||
    channelRulesRefuseCart(flags.channelRules, viewer)
  );
}

/** The unit price a resolved cart price charges — sale when there is one, else list. */
export function chargedUnitPrice(pricing: { listPrice: string | null; salePrice: string | null }): number {
  const raw = pricing.salePrice != null && pricing.salePrice !== "" ? pricing.salePrice : pricing.listPrice;
  const n = typeof raw === "string" ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * The refusal for an Add to Cart, or null when the product may be bought online.
 *
 * `unitPrice` is the price the cart WOULD charge for this shopper before any
 * paid extras — extras must never lift a quote-only $0 machine into the cart
 * priced at its accessories alone (card 0CDcCYmO's own rule).
 */
export function refuseOnlinePurchase(
  flags: OnlinePurchaseFlags | null | undefined,
  unitPrice: number | null | undefined,
  /** services `purchasingDisabledMessage(product, variant)` — non-null means "quote only". */
  purchasingMessage?: string | null,
  /** Who is buying — omitted reads as a guest (see the header). */
  viewer?: OnlinePurchaseViewer | null
): string | null {
  const said = (purchasingMessage ?? "").trim();
  if (said) return said;
  if (onlineOrderingOff(flags, viewer)) return CART_RESTRICTED_ERROR;
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) return CART_RESTRICTED_ERROR;
  return null;
}

/**
 * May a promotion put this product in the cart FOR the shopper (card EIXdjw2s, review round 3)?
 *
 * An "Automatically Add Product To Cart" reward is a line the shopper never chose and cannot
 * remove: it comes and goes with its offer. So it may only ever be a line the cart would SELL —
 * otherwise the shopper is handed a free item they cannot take out, and `placeOrder` then refuses
 * the whole order and tells them to remove it (behaviour register sf-cart / sf-checkout). The
 * reward is therefore judged by exactly what `placeOrder` re-checks on every line:
 *
 *   * `onlineOrderingOff` — Add to Cart switched off, Zoey "quote only", a hidden price, a quote-only
 *     variant, and this storefront's Zoey rules (zero-price, out-of-stock, cart disabled, and guest
 *     quote-only for a guest);
 *   * `canPurchaseQuantity` — a "do not back-order" product short of the units the reward gives;
 *
 * plus, when the caller has priced it, the Add to Cart rule that a $0 product sells by quote only.
 * True = refuse (do not add it; take it back out if it is already there). Unknown facts refuse
 * nothing, as for any add.
 */
export function rewardLineRefused(
  facts: (OnlinePurchaseFlags & StockFacts) | null | undefined,
  quantity: number,
  opts: { viewer?: OnlinePurchaseViewer | null; unitPrice?: number | null } = {}
): boolean {
  if ("unitPrice" in opts && !(typeof opts.unitPrice === "number" && Number.isFinite(opts.unitPrice) && opts.unitPrice > 0)) {
    return true;
  }
  if (!facts) return false;
  if (onlineOrderingOff(facts, opts.viewer)) return true;
  return !canPurchaseQuantity(facts, Math.max(1, Math.floor(quantity) || 1));
}
