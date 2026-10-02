import "server-only";

// ============================================================================
// Does THIS storefront's Zoey rule set refuse Add to Cart for the shopper looking at a product?
// (`metafields.zoey_channel_rules[CHANNEL_ID]`, portal PR #1028.)
//
// For IK's FALLBACK product renderers — the legacy product page and the block path; the live node
// template gets the same answer from services `getProductPageData`. The shared product row only has
// the zero-price rule folded in (services `applyChannelRulesToProductRow`: price hidden + no cart);
// out-of-stock (everyone) and guest quote-only (guests) are applied here from the row's own
// metafields. The session is read only for a product carrying the guest rule. A product with no rules
// for this channel reads false — today's behaviour.
// ============================================================================

import { channelRuleEffects, channelRulesOfRow } from "@keenan/services/channel-rules";
import { getSession } from "@/lib/auth";
import { CHANNEL_ID } from "@/lib/channel";

export async function channelRulesRefuseCartFor(product: unknown): Promise<boolean> {
  const rules = channelRulesOfRow(product, CHANNEL_ID);
  if (!rules) return false;
  const viewer = rules.guestQuoteOnly
    ? { loggedIn: (await getSession().catch(() => null)) != null }
    : { loggedIn: true };
  return channelRuleEffects(rules, viewer).cartRefused;
}
