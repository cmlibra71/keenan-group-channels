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
// Every refusal is the same sentence the cart already shows for a restricted line
// (`CART_RESTRICTED_ERROR`), because it says what to do instead: add it to a quote.
//
// Pure, so the rules are unit-tested (`online-purchase.test.ts`). Listed in
// `orchestrator/shared-modules.json`: both storefronts refuse word for word.
// ============================================================================

import { CART_RESTRICTED_ERROR } from "./restricted-message";

export interface OnlinePurchaseFlags {
  restrictAddToCart?: boolean | null;
  purchasingDisabled?: boolean | null;
  hidePrice?: boolean | null;
  /** The chosen variant's own `purchasing_disabled`. */
  variantPurchasingDisabled?: boolean | null;
}

/**
 * Staff switched this product off for online ordering, whatever it costs. Used for a
 * cart LINE too (the row marks itself and refuses an increase), where the price
 * is not re-read.
 */
export function onlineOrderingOff(flags: OnlinePurchaseFlags | null | undefined): boolean {
  if (!flags) return false;
  return (
    flags.restrictAddToCart === true ||
    flags.purchasingDisabled === true ||
    flags.hidePrice === true ||
    flags.variantPurchasingDisabled === true
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
  unitPrice: number | null | undefined
): string | null {
  if (onlineOrderingOff(flags)) return CART_RESTRICTED_ERROR;
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) return CART_RESTRICTED_ERROR;
  return null;
}
