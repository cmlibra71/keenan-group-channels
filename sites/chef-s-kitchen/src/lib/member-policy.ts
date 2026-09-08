/**
 * Who gets member pricing — the pure decision, with no database or session in it.
 *
 * Split out of member.ts so the rule can be tested directly. member.ts fetches the
 * facts; this decides. Same shape as lib/checkout/net-terms-policy.ts.
 *
 * THE RULE: only a signed-in shopper with an ACTIVE subscription carries a pricing
 * group. Everyone else — logged out, or logged in without a live subscription —
 * carries `customerGroupId: null`, so no member price is computed for them and none
 * can reach the page.
 *
 * This site used to hand guests the base member group so the page could show them the
 * member price as a "join and pay this" funnel. That published trade pricing to the
 * open internet, and on a cost-plus channel at 0% markup it published the buy price.
 * The funnel then survived as `teaserCustomerGroupId`, a rounded PERCENTAGE only —
 * and that is now retired too (card Nyp8bkPm): see the note on the guest branch.
 */

export interface MemberPricingFacts {
  /** channel_settings.member_pricing_enabled */
  featureEnabled: boolean;
  /** A session cookie is present (signed in — says nothing about membership). */
  hasSession: boolean;
  /** That contact has a subscription in `active` status right now. */
  hasActiveSubscription: boolean;
  /** The contact's own customer group, when they have one. */
  contactGroupId: number | null;
  /** The cheapest active plan's member group — what a new subscriber would pay at. */
  basePlanGroupId: number | null;
  /** The cheapest active plan's monthly price, for "Join from $X/mo". */
  basePlanPrice: string | null;
  /** The shopper's B2B account, if any. Never gated by membership. */
  accountId: number | null;
}

export interface MemberPricingDecision {
  isMember: boolean;
  loggedIn: boolean;
  customerGroupId: number | null;
  teaserCustomerGroupId: number | null;
  planPrice: string | null;
  accountId: number | null;
}

export function resolveMemberPricing(facts: MemberPricingFacts): MemberPricingDecision {
  const { accountId, hasSession } = facts;

  // The master switch turns off MEMBER pricing, not account pricing: a negotiated
  // contract price is not a membership perk, so accountId survives regardless.
  if (!facts.featureEnabled) {
    return {
      isMember: false,
      loggedIn: hasSession,
      customerGroupId: null,
      teaserCustomerGroupId: null,
      planPrice: null,
      accountId,
    };
  }

  if (hasSession && facts.hasActiveSubscription) {
    return {
      isMember: true,
      loggedIn: true,
      customerGroupId: facts.contactGroupId ?? facts.basePlanGroupId,
      teaserCustomerGroupId: null, // members see real prices; nothing to tease
      planPrice: facts.basePlanPrice,
      accountId,
    };
  }

  // Guest, or signed in without an active subscription. No pricing group: the page
  // will fall back to RRP everywhere.
  //
  // NO SAVINGS PERCENTAGE (card Nyp8bkPm; Tim's membership pack, approved on the
  // board 2026-08-24). `teaserCustomerGroupId` used to carry the cheapest plan's
  // group so a rounded whole percentage — "Members save up to 19%" — could be put
  // on the product page and every listing tile. Under Tim's model that number
  // cannot honestly be produced: a member's price is interpolated between the
  // Wholesale and Reseller trade prices, and the spread between them differs SKU
  // by SKU, so the system has no single discount percentage and one cannot be
  // derived. His pack forbids publishing any figure until the M-to-R spread
  // distribution has been measured across the catalogue, and its compliance note
  // is explicit that a published claim has to survive an Australian Consumer Law
  // challenge on substantiation.
  //
  // Returning null here is the ONE seam that retires it: `memberSavingsPct` falls
  // to 0 everywhere, so the gold "Members save up to X%" box on the product page
  // and the badge on every tile stop rendering without a single component edit,
  // and the number cannot leak back through a surface nobody remembered. What
  // replaces it is the member-pricing panel on the product page — the actual RRP,
  // Mates Rates and member figures, and the ladder — which says more than the
  // percentage did and is true.
  //
  // Restoring the percentage means measuring the spread first. Do not set this
  // back to `facts.basePlanGroupId` to "fix" a missing badge.
  return {
    isMember: false,
    loggedIn: hasSession,
    customerGroupId: null,
    teaserCustomerGroupId: null,
    planPrice: facts.basePlanPrice,
    accountId,
  };
}
