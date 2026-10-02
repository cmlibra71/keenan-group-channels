import { cache } from "react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getActiveSubscriptionForContact,
  contactService,
  getMemberPriceMap,
  accountService,
  applyAccountPricesToProducts,
  applyAdvertisedLadderPrices,
  applySpecialPrices,
  getMemberLadderShare,
  applyGroupPrices,
  resolveViewerPricingGroupId,
} from "@/lib/store";

export interface MemberContext {
  /** True only for a logged-in customer with an ACTIVE subscription. */
  isMember: boolean;
  /**
   * Signed in at all — independent of membership, and resolved even when
   * member pricing is switched off. Builder conditions ask "is this visitor
   * logged in?", which is not a membership question.
   */
  loggedIn: boolean;
  /** The member's customer group (tier) — what unlocks member pricing. */
  customerGroupId: number | null;
  /**
   * The shopper's buying ACCOUNT (B2B). Its per-account product prices override every other price.
   * Deliberately NOT gated behind the member_pricing flag or an active subscription — a negotiated
   * contract price is not a membership perk. Null for guests and accountless shoppers.
   */
  accountId: number | null;
  /**
   * The member's position on the Chefs Depot price scale (card gk23c1VK), 0..1, or null when
   * this channel has no ladder switched on — which is every channel but Chefs
   * Depot. Resolved once per request and threaded into every pricing call.
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
 * The customer group whose PRICE LIST prices this viewer — Industry Kitchens' Zoey model
 * (services `groupPricing.ts`): the buying ACCOUNT's group, else the person's own, else the
 * storefront's not-logged-in tier (a guest is priced from "NOT LOGGED IN", as on Zoey).
 *
 * Null on a channel without `customer_group_pricing` switched on — Chefs Depot — after one
 * cached settings read, so nothing below changes there. Independent of membership: it is NOT the
 * member-pricing group (`getMemberContext().customerGroupId`, which only an active Chefs Depot
 * member carries). Memoized per request: every catalogue surface, the cart and checkout ask.
 */
export const getPricingGroupId = cache(async (): Promise<number | null> => {
  const [session, accountId] = await Promise.all([getSession(), getAccountId()]);
  return resolveViewerPricingGroupId({ accountId, contactId: session?.contactId ?? null }).catch(() => null);
});

/**
 * Resolve the current visitor's membership state for pricing purposes.
 * Membership is the key, the customer group sets the tier depth: a lapsed
 * subscription means no member pricing even if the group is still assigned.
 * The account dimension is resolved independently (see MemberContext.accountId).
 */
export async function getMemberContext(): Promise<MemberContext> {
  const accountId = await getAccountId();
  // Resolved BEFORE the member-pricing gate: a visitor is signed in or not
  // regardless of whether member pricing is switched on.
  const session = await getSession();
  const none: MemberContext = {
    isMember: false,
    loggedIn: !!session,
    customerGroupId: null,
    accountId,
    ladderShare: null,
  };

  const enabled = await getFeatureFlag("member_pricing_enabled");
  if (!enabled) return none;
  if (!session) return none;

  const activeSub = await getActiveSubscriptionForContact(session.contactId);
  if (!activeSub) return none;

  const contact = (await contactService.getById(session.contactId)) as {
    customer_group_id: number | null;
  } | null;

  // The member's position on the price scale (card gk23c1VK) — null on a channel with the scale off.
  const ladderShare = await getMemberLadderShare({
    accountId,
    contactId: session.contactId,
  }).catch(() => null);

  return {
    isMember: true,
    loggedIn: true,
    customerGroupId: contact?.customer_group_id ?? null,
    accountId,
    ladderShare,
  };
}

/**
 * Apply this shopper's account prices to catalogue rows that came out of a SHARED source —
 * `unstable_cache`, the `category_listing_cache` table or the Meilisearch index — none of which can
 * hold a per-account price without leaking it to everyone. The override is applied HERE, per
 * request, to a copy of the rows; the cache/index is never written to. Guests are a no-op.
 */
export async function applyAccountPrices<T extends { id: number }[]>(products: T): Promise<T> {
  if (products.length === 0) return products;
  // The buying-group ADVERTISED price first (card gk23c1VK) — a no-op on a
  // channel with no ladder — then the account's contract prices over the top.
  const advertised = (await applyAdvertisedLadderPrices(products as never)) as T;
  // The viewer's customer-group price list (Industry Kitchens) — between the advertised price and
  // the account's contract prices, which still win. Identity on a channel without it switched on.
  const grouped = (await applyGroupPrices(advertised as never, await getPricingGroupId())) as T;
  const accountId = await getAccountId();
  const accountPriced = accountId
    ? ((await applyAccountPricesToProducts(grouped as never, accountId)) as T)
    : grouped;
  // A PARTNER SPECIAL goes on LAST, over every layer above (card tJ4audbu): it is a locked price
  // for every shopper, so it strikes through whatever the row was advertising — the group price and
  // the account's own contract price included — and beats the contract price in both directions.
  // Identity for a row with no special.
  return applySpecialPrices(accountPriced as never) as Promise<T>;
}

/**
 * Member prices for a page of listing products — empty for non-members, so
 * callers can pass the result straight to ProductGrid's memberPriceMap. The account is threaded in
 * so an account price suppresses a group "member price" that would otherwise undercut it.
 */
export async function getListingMemberPrices(
  products: { id: number }[]
): Promise<Record<number, number>> {
  if (products.length === 0) return {};
  const { customerGroupId, accountId, ladderShare } = await getMemberContext();
  if (!customerGroupId && !accountId) return {};
  // On a customer-group-pricing channel (Industry Kitchens) the account's contract prices are
  // resolved AT its group, so a product with no contract price comes back at the group record —
  // the price the tile already shows — and never at a bare catalogue sale that would undercut it
  // under a "Member Price" label the cart does not charge. Null group elsewhere: unchanged.
  const pricingGroupId = customerGroupId ?? (accountId ? await getPricingGroupId() : null);
  return getMemberPriceMap(products.map((p) => p.id), pricingGroupId, accountId, ladderShare);
}
