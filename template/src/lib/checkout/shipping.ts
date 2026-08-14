// ============================================================================
// Free-delivery eligibility — the one definition of "does free delivery apply".
//
// Previously this 3-way rule (enabled AND member AND amount >= threshold) was
// hand-inlined in four places — the order action (charged amount), CheckoutForm
// (×2, display + shipping-fetch skip) and CartSummary (display) — each passing a
// DIFFERENT amount basis (ex-tax subtotal / subtotal / post-discount total). A
// single predicate concentrates the rule and forces every call site to name the
// `amount` it qualifies on, so the basis it uses is visible at the call (not a
// silent divergence buried three files apart).
//
// NOTE (deliberately NOT folded in): MembershipCartUpsell asks a different
// question — "would this order qualify on amount alone if you joined" — so it
// omits isMember on purpose and does not use this predicate.
//
// Two ways to earn free delivery, and this is the only place they are combined:
//   • the MEMBER threshold — enabled AND member AND amount >= threshold;
//   • a BRAND free-shipping special — the cart holds an item from a brand that
//     is being marketed with free shipping today. Everyone, no minimum spend,
//     no membership (card 88Ay7UGA). Whether one applies is decided in
//     `free-shipping-brands-policy.ts` and handed in already resolved, because
//     it needs the cart's brands and this stays pure.
//
// The actual shipping COST (zone rate-card lookup) is impure and stays in the
// order action / the /api/shipping/calculate route; only the eligibility decision
// is pure and shared here.
// ============================================================================

/** Default free-delivery threshold (AUD) when a channel sets none. */
export const DEFAULT_FREE_DELIVERY_THRESHOLD = 500;

export function qualifiesForFreeDelivery(params: {
  enabled: boolean;
  isMember: boolean;
  /** The order amount this channel qualifies free delivery on (see NOTE on basis). */
  amount: number;
  threshold: number;
  /**
   * A brand free-shipping special covers this cart. Independent of the member
   * threshold: it ignores `enabled`, `isMember` and `amount` entirely, because
   * the special is public and has no minimum spend.
   */
  brandFreeShipping?: boolean;
}): boolean {
  const { enabled, isMember, amount, threshold, brandFreeShipping } = params;
  if (brandFreeShipping) return true;
  return enabled && isMember && amount >= threshold;
}
