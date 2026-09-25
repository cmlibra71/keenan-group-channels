// ============================================================================
// What the bundle picker may SAY about money (card Tc5ekvD6). Pure, so the rules are tested once
// and both copies of the block (template/IK and Chefs Depot's restyle) read the same answer.
//
//   - A price staff hid on the bundle hides every price in the picker too: the component prices
//     add up to the hidden figure (7vu2iEEZ — "a hidden price must hide the rent with it" is the
//     same reasoning one level down).
//   - "Price as configured" is the page's OWN headline, read off the purchase provider after the
//     build has been priced into it — the member / contract price where it is the lower one,
//     exactly as the headline chooses — never a sum worked out again here, so the picker and the
//     buy box cannot print two figures for one build.
//   - It is not printed when a chosen part has no price online (`total` null): a total that
//     silently leaves a part out is wrong money. The block then says the configuration is priced
//     by the team, which is also what the cart will say if Add to Cart is pressed.
// ============================================================================

export interface BundleMoneyPurchase {
  hidePrice: boolean;
  displayPrice: number;
  displaySalePrice: number | null;
  activeMemberPrice: number | null;
  restrictAddToCart: boolean;
  purchaseBlockedByStock: boolean;
}

export interface BundleMoney {
  /** Print each choice's "+ $X". */
  showPrices: boolean;
  /** The configured price for one bundle, ex GST, or null when there is none to state. */
  configured: number | null;
  /** The page offers Add to Cart for this build, so the cart-line sentence is true. */
  cartOffered: boolean;
}

export function bundleMoney({
  purchase,
  total,
}: {
  purchase: BundleMoneyPurchase | null;
  total: number | null;
}): BundleMoney {
  if (!purchase || purchase.hidePrice) return { showPrices: false, configured: null, cartOffered: false };
  if (total == null) return { showPrices: true, configured: null, cartOffered: false };
  const rrp = purchase.displaySalePrice ?? purchase.displayPrice;
  const member = purchase.activeMemberPrice;
  const headline = member != null && member > 0 && member < rrp ? member : rrp;
  const configured = Number.isFinite(headline) && headline > 0 ? headline : null;
  return {
    showPrices: true,
    configured,
    cartOffered: configured != null && !purchase.restrictAddToCart && !purchase.purchaseBlockedByStock,
  };
}
