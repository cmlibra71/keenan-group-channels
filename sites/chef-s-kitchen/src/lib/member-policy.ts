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
 * The funnel survives as `teaserCustomerGroupId`, which resolves a PERCENTAGE only.
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
  // will fall back to RRP everywhere. The base plan group is passed separately and
  // is used ONLY to derive a rounded savings percentage for the join teaser.
  return {
    isMember: false,
    loggedIn: hasSession,
    customerGroupId: null,
    teaserCustomerGroupId: facts.basePlanGroupId,
    planPrice: facts.basePlanPrice,
    accountId,
  };
}
