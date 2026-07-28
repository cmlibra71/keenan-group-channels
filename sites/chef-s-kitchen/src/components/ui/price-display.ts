/**
 * What a price block shows — the decision, with no React and no formatting in it.
 *
 * Pulled out of PriceBlock.tsx so the rules can be tested directly, because one of
 * them is load-bearing in a way that is easy to break silently: the join CTA used
 * to be nested inside "there is a member price", and non-members no longer have
 * one. Gate the pricing without moving the CTA and the entire membership funnel
 * disappears from every product surface while the page still looks fine.
 */

export type PriceAudience =
  /** Active member: their own price, described as a member price. */
  | "member"
  /** Signed-in B2B account holder, not a member: a negotiated contract price. */
  | "account"
  /** Everyone else: RRP, plus an invitation to join. */
  | "public";

export interface PriceDisplayInput {
  /** The catalogue price (products.price). Always the reference point. */
  rrp: number;
  /** The price THIS shopper gets, when they get one. Null for non-members
   *  without an account — no member price is computed for them. */
  memberPrice?: number | null;
  isMember?: boolean;
  /** The member price is really a B2B contract price. */
  accountPricing?: boolean;
  /** What membership would save on this product, as a whole percentage.
   *  Non-members only; never accompanied by a price. */
  memberSavingsPct?: number;
}

export interface PriceDisplay {
  /** Nothing to render (POA / no price). */
  hidden: boolean;
  audience: PriceAudience;
  /** The big number. */
  headline: number;
  /** Show "RRP $x" struck through beside the headline. */
  showStruckRrp: boolean;
  /** Dollar saving and percentage — ONLY ever populated for a member. */
  savings: number;
  savingsPct: number;
  /** Label the headline explicitly as RRP (nothing else is competing with it). */
  showRrpLabel: boolean;
  /** "Member Price" badge. */
  showMemberBadge: boolean;
  /** "Your account price" label. */
  showAccountLabel: boolean;
  /** The join funnel: teaser copy + CTA. Independent of whether a member price
   *  exists, which is the entire point. */
  showJoin: boolean;
  /** Percentage to advertise in the teaser. 0 = no number, copy stays generic. */
  teaserPct: number;
}

export function derivePriceDisplay(input: PriceDisplayInput): PriceDisplay {
  const { rrp, memberPrice, isMember = false, accountPricing = false } = input;
  const teaserPct = Math.max(0, Math.round(input.memberSavingsPct ?? 0));

  const blank: PriceDisplay = {
    hidden: true,
    audience: "public",
    headline: 0,
    showStruckRrp: false,
    savings: 0,
    savingsPct: 0,
    showRrpLabel: false,
    showMemberBadge: false,
    showAccountLabel: false,
    showJoin: false,
    teaserPct: 0,
  };

  // POA / quote-only: the caller renders its own "Call for Price".
  if (!Number.isFinite(rrp) || rrp <= 0) return blank;

  const hasDeal = memberPrice != null && memberPrice > 0 && memberPrice < rrp;

  if (hasDeal && accountPricing && !isMember) {
    // A negotiated price. Not a membership perk, so no member vocabulary and no
    // pitch to join something they already have a better deal than.
    return {
      ...blank,
      hidden: false,
      audience: "account",
      headline: memberPrice as number,
      showStruckRrp: true,
      showAccountLabel: true,
    };
  }

  if (hasDeal) {
    // A member seeing their own price. Unchanged from how this always worked.
    const savings = rrp - (memberPrice as number);
    return {
      ...blank,
      hidden: false,
      audience: "member",
      headline: memberPrice as number,
      showStruckRrp: true,
      savings,
      savingsPct: Math.round((savings / rrp) * 100),
      showMemberBadge: true,
      // A member with no better offer elsewhere is not a join target.
      showJoin: false,
    };
  }

  // No price advantage. Either a non-member (the common case now) or a member on
  // a product with no member deal.
  return {
    ...blank,
    hidden: false,
    audience: isMember ? "member" : "public",
    headline: rrp,
    // Say what the number IS. Without a struck-through price beside it, an
    // unlabelled figure reads as "the price", which is exactly what it is — but
    // being explicit stops it reading as a discounted one.
    showRrpLabel: !isMember,
    showJoin: !isMember,
    teaserPct: isMember ? 0 : teaserPct,
  };
}
