import { getSession } from "@/lib/auth";
import { getFeatureFlag, getActiveSubscription, customerService, getMemberPriceMap } from "@/lib/store";

export interface MemberContext {
  /** True only for a logged-in customer with an ACTIVE subscription. */
  isMember: boolean;
  /** The member's customer group (tier) — what unlocks member pricing. */
  customerGroupId: number | null;
}

/**
 * Resolve the current visitor's membership state for pricing purposes.
 * Membership is the key, the customer group sets the tier depth: a lapsed
 * subscription means no member pricing even if the group is still assigned.
 */
export async function getMemberContext(): Promise<MemberContext> {
  const none: MemberContext = { isMember: false, customerGroupId: null };

  const enabled = await getFeatureFlag("member_pricing_enabled");
  if (!enabled) return none;

  const session = await getSession();
  if (!session) return none;

  const activeSub = await getActiveSubscription(session.customerId);
  if (!activeSub) return none;

  const customer = (await customerService.getById(session.customerId)) as {
    customer_group_id: number | null;
  } | null;

  return { isMember: true, customerGroupId: customer?.customer_group_id ?? null };
}

/**
 * Member prices for a page of listing products — empty for non-members, so
 * callers can pass the result straight to ProductGrid's memberPriceMap.
 */
export async function getListingMemberPrices(
  products: { id: number }[]
): Promise<Record<number, number>> {
  if (products.length === 0) return {};
  const { customerGroupId } = await getMemberContext();
  if (!customerGroupId) return {};
  return getMemberPriceMap(products.map((p) => p.id), customerGroupId);
}
