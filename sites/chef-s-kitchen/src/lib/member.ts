import { cache } from "react";
import { getSession } from "@/lib/auth";
import { bundleListingTotals, withBundleListingPrices, withBundleMemberPrices } from "@/lib/pricing/bundle-listing";
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
  getMemberLadderShare,
} from "@/lib/store";

export interface MemberContext {
  /**
   * True for a logged-in shopper reached by an ACTIVE subscription — their own, or one
   * held by the BUSINESS they buy for (card avihBwqi). A membership belongs to the
   * account; the colleague who happened to sign up is not its owner. Resolved once, in
   * `getActiveSubscriptionForContact`, so the badge, the price and the checkout cannot
   * disagree.
   */
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
   * The member's position on the Chefs Depot price scale (card gk23c1VK), 0..1,
   * or null when the channel has the scale switched off. Resolved once per
   * request and threaded into every pricing call, so a listing card, the
   * product page and the cart cannot price one member at two positions.
   */
  ladderShare: number | null;
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
export async function applyAccountPrices<T extends { id: number }[]>(
  products: T,
  /**
   * `bundleBuild: false` is for the ONE caller that prices a bundle's build itself — the product
   * page's own product, where `KitPurchaseProvider` adds the live build. Every listing row (tile,
   * search hit, rail) takes the default: a bundle priced at the build its page opens on, so the
   * tile and the page state one figure (card Tc5ekvD6, `lib/pricing/bundle-listing.ts`).
   */
  opts: { bundleBuild?: boolean } = {}
): Promise<T> {
  if (products.length === 0) return products;
  const priced = await applyAccountPricesOnly(products);
  return opts.bundleBuild === false ? priced : withBundleListingPrices(priced);
}

async function applyAccountPricesOnly<T extends { id: number }[]>(products: T): Promise<T> {
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
 *
 * "Active subscriber" now means REACHED BY an active membership, the shopper's own or
 * their business's (card avihBwqi): `getActiveSubscriptionForContact` prefers the
 * account and falls back to the person. A GUEST is still no part of it — there is no
 * session, so no contact, so no account, so no membership, and the guest-pricing gate
 * (memory `cd_guest_pricing_gate`) is untouched.
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

  // The member's position on the price scale (card gk23c1VK). Only an ACTIVE MEMBER has one: a non-member
  // is priced at the advertised price and never at a level, which is the same
  // rule that keeps a member price off a guest's screen (cd_guest_pricing_gate).
  // Null on a channel with no ladder switched on, i.e. everywhere until one is.
  const ladderShare = resolved.isMember
    ? await getMemberLadderShare({
        accountId,
        contactId: session?.contactId ?? null,
      }).catch(() => null)
    : null;

  return { ...resolved, ladderShare };
}

/**
 * Member prices for a page of listing products, keyed by product id. Only ever
 * populated for an active member, or for a B2B account's contract prices.
 */
export async function getListingMemberPrices(
  products: { id: number }[]
): Promise<Record<number, number>> {
  if (products.length === 0) return {};
  const { customerGroupId, accountId, ladderShare } = await getMemberContext();
  if (!customerGroupId && !accountId) return {};
  const ids = products.map((p) => p.id);
  // A bundle's member / contract price carries its opening build, as its page's does (Tc5ekvD6).
  return withBundleMemberPrices(await getMemberPriceMap(ids, customerGroupId, accountId, ladderShare), ids);
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

  const [memberPriceMap, savingsPctMapRaw, bundleTotals] = await Promise.all([
    (ctx.customerGroupId || ctx.accountId) && has
      ? getMemberPriceMap(ids, ctx.customerGroupId, ctx.accountId, ctx.ladderShare).then((map) =>
          // A bundle's member / contract price carries its opening build, as its page's does.
          withBundleMemberPrices(map, ids)
        )
      : Promise.resolve({} as Record<number, number>),
    // Non-members: percentage only, so the cards can still sell membership.
    !ctx.isMember && ctx.teaserCustomerGroupId && has
      ? getMemberSavingsPctMap(
          products as Array<{ id: number; price?: string | number | null }>,
          ctx.teaserCustomerGroupId
        )
      : Promise.resolve({} as Record<number, number>),
    has ? bundleListingTotals(ids).catch(() => new Map<number, number>()) : Promise.resolve(new Map<number, number>()),
  ]);
  // The join teaser's percentage is worked out on the bundle SKU's own price, not on its build, so
  // on a bundle tile it would state a saving the build does not carry — a bundle shows none
  // (card Tc5ekvD6).
  const savingsPctMap =
    bundleTotals.size === 0
      ? savingsPctMapRaw
      : Object.fromEntries(Object.entries(savingsPctMapRaw).filter(([id]) => !bundleTotals.has(Number(id))));

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
