import { cache } from "react";
import { getSession } from "@/lib/auth";
import { resolveMemberPricing } from "@/lib/member-policy";
import {
  getFeatureFlag,
  getActiveSubscriptionForContact,
  getSubscriptionPlans,
  contactService,
  getMemberPriceMap,
  getMemberSavingsPctMap,
  accountService,
  applyAccountPricesToProducts,
  applyAdvertisedLadderPrices,
  getMemberLadderLevelId,
} from "@/lib/store";

export interface MemberContext {
  /** True only for a logged-in customer with an ACTIVE subscription. */
  isMember: boolean;
  /** Signed in at all — a session exists. A non-member can be logged in. */
  loggedIn: boolean;
  /**
   * The customer group used for pricing. Set ONLY for an active member, whose tier
   * it is. NULL for everyone else, so no member price is computed for them and none
   * can reach the page.
   *
   * This used to be the plan's base member group for guests too, so the page could
   * show them the member price as a "Join → pay $X" funnel. That published trade
   * pricing to anyone, and at a 0% cost-plus markup it published the buy price.
   */
  customerGroupId: number | null;
  /**
   * Group used ONLY to work out what membership would SAVE a non-member, as a
   * rounded percentage. Never used to price anything shown or charged — see
   * getListingPricing / getMemberSavingsPctMap. Null for members.
   */
  teaserCustomerGroupId: number | null;
  /** The cheapest active plan's monthly price, for "Join from $X/mo" lines. */
  planPrice: string | null;
  /**
   * The shopper's buying ACCOUNT (B2B). Its per-account product prices override every other price.
   * Deliberately NOT gated behind the member_pricing flag or a subscription — a negotiated contract
   * price is not a membership perk. Null for guests and accountless shoppers.
   */
  accountId: number | null;
  /**
   * The shopper's rung on the Chefs Depot buying-group ladder (card gk23c1VK),
   * or null when the channel has no ladder switched on. Resolved once per
   * request and threaded into every pricing call, so a listing card, the
   * product page and the cart cannot land on different rungs in one page load.
   */
  ladderLevelId: string | null;
}

/**
 * The logged-in shopper's account, via their DEFAULT active membership (falling back to the legacy
 * contact-email link) — the same membership-then-email resolution net terms and account options use.
 * Memoized per request: every listing/PDP surface asks for it.
 */
export const getAccountId = cache(async (): Promise<number | null> => {
  const session = await getSession();
  if (!session) return null;
  const resolved = await accountService
    .resolveAccountIdForContact(session.contactId, { emailFallback: session.email })
    .catch(() => null);
  return resolved?.accountId ?? null;
});

/**
 * Apply this request's PRICE OVERLAYS to catalogue rows that came out of a SHARED source —
 * `unstable_cache`, the `category_listing_cache` table or the Meilisearch index — none of which
 * can hold a per-request price without leaking it to everyone. Both overlays are applied HERE,
 * per request, to a copy of the rows; the cache/index is never written to.
 *
 * Two layers, in order:
 *  1. the buying-group ADVERTISED price (card gk23c1VK) — what a logged-out visitor pays on a
 *     channel whose ladder advertises the Industry Kitchens trade price. A no-op on a channel
 *     with no ladder, which is every channel until one is switched on.
 *  2. the shopper's ACCOUNT contract prices, which override everything above them.
 *
 * Named `applyAccountPrices` for its original single job and kept that way deliberately: it is
 * called from a dozen surfaces, and one funnel is what stops a rail, a grid and a search page
 * quoting three prices for one product.
 */
export async function applyAccountPrices<T extends { id: number }[]>(products: T): Promise<T> {
  if (products.length === 0) return products;
  const advertised = (await applyAdvertisedLadderPrices(products as never)) as T;
  const accountId = await getAccountId();
  if (!accountId) return advertised;
  return applyAccountPricesToProducts(advertised as never, accountId) as Promise<T>;
}

/** The plan's base member group — what a new subscriber would be priced at. */
async function getBasePlan(): Promise<{ groupId: number | null; price: string | null }> {
  const plans = (await getSubscriptionPlans()) as {
    price: string | null;
    member_customer_group_id: number | null;
  }[];
  const plan = plans[0];
  return { groupId: plan?.member_customer_group_id ?? null, price: plan?.price ?? null };
}

/**
 * Resolve the current visitor's membership state for pricing purposes.
 *
 * Fetches the facts; `resolveMemberPricing` in member-policy.ts decides. Only an
 * active subscriber comes back with a pricing group — see that file for why.
 */
export async function getMemberContext(): Promise<MemberContext> {
  const accountId = await getAccountId();
  const enabled = await getFeatureFlag("member_pricing_enabled");
  const session = await getSession();

  // Only reach for the plan and the subscription when they can change the answer.
  const base = enabled ? await getBasePlan() : { groupId: null, price: null };
  const activeSub = enabled && session ? await getActiveSubscriptionForContact(session.contactId) : null;
  const contact =
    activeSub && session
      ? ((await contactService.getById(session.contactId)) as { customer_group_id: number | null } | null)
      : null;

  const resolved = resolveMemberPricing({
    featureEnabled: !!enabled,
    hasSession: session != null,
    hasActiveSubscription: activeSub != null,
    contactGroupId: contact?.customer_group_id ?? null,
    basePlanGroupId: base.groupId,
    basePlanPrice: base.price,
    accountId,
  });

  // The ladder rung (card gk23c1VK). Only an ACTIVE MEMBER has one: a non-member
  // is priced at the advertised price and never at a level, which is the same
  // rule that keeps a member price off a guest's screen (cd_guest_pricing_gate).
  // Null on a channel with no ladder switched on, i.e. everywhere until one is.
  const ladderLevelId = resolved.isMember
    ? await getMemberLadderLevelId({
        accountId,
        contactId: session?.contactId ?? null,
      }).catch(() => null)
    : null;

  return { ...resolved, ladderLevelId };
}

/**
 * Member prices for a page of listing products, keyed by product id. Only ever
 * populated for an active member, or for a B2B account's contract prices.
 */
export async function getListingMemberPrices(
  products: { id: number }[]
): Promise<Record<number, number>> {
  if (products.length === 0) return {};
  const { customerGroupId, accountId, ladderLevelId } = await getMemberContext();
  if (!customerGroupId && !accountId) return {};
  return getMemberPriceMap(products.map((p) => p.id), customerGroupId, accountId, ladderLevelId);
}

export interface ListingPricing {
  /** productId → the price this shopper actually gets, when it beats RRP. Empty for
   *  non-members without an account. NEVER contains a member price for a non-member. */
  memberPriceMap: Record<number, number>;
  isMember: boolean;
  planPrice: string | null;
  /** productId → what membership would save, as a whole percentage. Populated only
   *  for NON-members (the join teaser); empty for members, who see real prices. */
  savingsPctMap: Record<number, number>;
  /** Every price in `memberPriceMap` is a B2B contract price, not a member price —
   *  a signed-in non-member with an account. Drives the label copy on cards. */
  accountPricing: boolean;
}

/** One-call pricing bundle for grid pages: map + member state + plan price. */
export async function getListingPricing(products: { id: number }[]): Promise<ListingPricing> {
  const ctx = await getMemberContext();
  const ids = products.map((p) => p.id);
  const has = products.length > 0;

  const [memberPriceMap, savingsPctMap] = await Promise.all([
    (ctx.customerGroupId || ctx.accountId) && has
      ? getMemberPriceMap(ids, ctx.customerGroupId, ctx.accountId, ctx.ladderLevelId)
      : Promise.resolve({} as Record<number, number>),
    // Non-members: percentage only, so the cards can still sell membership.
    !ctx.isMember && ctx.teaserCustomerGroupId && has
      ? getMemberSavingsPctMap(
          products as Array<{ id: number; price?: string | number | null }>,
          ctx.teaserCustomerGroupId
        )
      : Promise.resolve({} as Record<number, number>),
  ]);

  return {
    memberPriceMap,
    isMember: ctx.isMember,
    planPrice: ctx.planPrice,
    savingsPctMap,
    // With no pricing group, the only thing that can populate the map is an
    // account contract price — so this is exact, not a guess.
    accountPricing: !ctx.isMember && ctx.accountId != null,
  };
}
