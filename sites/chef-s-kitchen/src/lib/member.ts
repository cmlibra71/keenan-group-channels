import { getSession } from "@/lib/auth";
import {
  getFeatureFlag,
  getActiveSubscriptionForContact,
  getSubscriptionPlans,
  contactService,
  getMemberPriceMap,
} from "@/lib/store";

export interface MemberContext {
  /** True only for a logged-in customer with an ACTIVE subscription. */
  isMember: boolean;
  /**
   * The customer group used for pricing. For members this is their tier
   * group; for GUESTS it's the plan's base member group — the design system
   * shows guests the exact member price as the "Join → pay $X" conversion
   * funnel, so everyone gets a member figure computed at the base tier.
   */
  customerGroupId: number | null;
  /** The cheapest active plan's monthly price, for "Join from $X/mo" lines. */
  planPrice: string | null;
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
 * Membership is the key, the customer group sets the tier depth: a lapsed
 * subscription means MEMBER pricing display is lost (isMember false), but
 * like guests they still see the base member figure as the join funnel.
 */
export async function getMemberContext(): Promise<MemberContext> {
  const none: MemberContext = { isMember: false, customerGroupId: null, planPrice: null };

  const enabled = await getFeatureFlag("member_pricing_enabled");
  if (!enabled) return none;

  const base = await getBasePlan();

  const session = await getSession();
  if (session) {
    const activeSub = await getActiveSubscriptionForContact(session.contactId);
    if (activeSub) {
      const contact = (await contactService.getById(session.contactId)) as {
        customer_group_id: number | null;
      } | null;
      return {
        isMember: true,
        customerGroupId: contact?.customer_group_id ?? base.groupId,
        planPrice: base.price,
      };
    }
  }

  // Guest / non-member: price at the base member tier for the join funnel.
  return { isMember: false, customerGroupId: base.groupId, planPrice: base.price };
}

/**
 * Member prices for a page of listing products, keyed by product id. Computed
 * for guests too (base tier) so cards can render the "Join → pay $X" line.
 */
export async function getListingMemberPrices(
  products: { id: number }[]
): Promise<Record<number, number>> {
  if (products.length === 0) return {};
  const { customerGroupId } = await getMemberContext();
  if (!customerGroupId) return {};
  return getMemberPriceMap(products.map((p) => p.id), customerGroupId);
}

export interface ListingPricing {
  memberPriceMap: Record<number, number>;
  isMember: boolean;
  planPrice: string | null;
}

/** One-call pricing bundle for grid pages: map + member state + plan price. */
export async function getListingPricing(products: { id: number }[]): Promise<ListingPricing> {
  const ctx = await getMemberContext();
  const memberPriceMap =
    ctx.customerGroupId && products.length > 0
      ? await getMemberPriceMap(products.map((p) => p.id), ctx.customerGroupId)
      : {};
  return { memberPriceMap, isMember: ctx.isMember, planPrice: ctx.planPrice };
}
