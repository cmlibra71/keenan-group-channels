import { cache } from "react";
import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getActiveSubscriptionForContact,
  contactService,
  getMemberPriceMap,
  accountService,
  applyAccountPricesToProducts,
} from "@/lib/store";

export interface MemberContext {
  /** True only for a logged-in customer with an ACTIVE subscription. */
  isMember: boolean;
  /**
   * Signed in at all — independent of membership, and deliberately resolved
   * even when member pricing is switched off. Builder conditions ask
   * "is this visitor logged in?", which is not a membership question.
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
  };

  const enabled = await getFeatureFlag("member_pricing_enabled");
  if (!enabled) return none;
  if (!session) return none;

  const activeSub = await getActiveSubscriptionForContact(session.contactId);
  if (!activeSub) return none;

  const contact = (await contactService.getById(session.contactId)) as {
    customer_group_id: number | null;
  } | null;

  return {
    isMember: true,
    loggedIn: true,
    customerGroupId: contact?.customer_group_id ?? null,
    accountId,
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
  const accountId = await getAccountId();
  if (!accountId) return products;
  return applyAccountPricesToProducts(products as never, accountId) as Promise<T>;
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
  const { customerGroupId, accountId } = await getMemberContext();
  if (!customerGroupId && !accountId) return {};
  return getMemberPriceMap(products.map((p) => p.id), customerGroupId, accountId);
}
