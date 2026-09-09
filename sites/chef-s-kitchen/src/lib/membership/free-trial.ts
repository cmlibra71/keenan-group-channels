import "server-only";

import {
  CHANNEL_ID,
  getCheckoutSettings,
  readPriorFreeTrial,
  readQualifyingOrder,
} from "@/lib/store";
import { formatMemberSince } from "@/lib/member-date";
import {
  buildFreeTrialOffer,
  type FreeTrialOffer,
  type FreeTrialReaders,
  type FreeTrialRequest,
} from "./free-trial-offer";

export type { FreeTrialOffer };

/**
 * The free months on a Chefs Depot membership, resolved for ONE visitor (card ASTb3tCf).
 *
 * ONE ENTRY POINT ON PURPOSE. The checkout banner offers the free period, the subscribe
 * page repeats the offer, and `createSubscription` is the one that actually spends it.
 * All three call this, so a shopper cannot be promised a free period on one screen and
 * charged on the next. The arithmetic itself lives in `@keenan/services/membership-trial`
 * and the fact-gathering in `./free-trial-offer`, both unit-tested; this file only binds
 * the real store readers to them.
 *
 * NEVER TRUSTED FROM THE BROWSER. The decision is re-made server-side inside the action
 * that creates the subscription, from the same facts, so a stale checkout page cannot
 * buy a free period the person is not entitled to.
 */

const readers: FreeTrialReaders = {
  readPriorFreeTrial: (contactId) => readPriorFreeTrial(CHANNEL_ID, contactId),
  readQualifyingOrder: (contactId, thresholdIncTax) =>
    readQualifyingOrder(CHANNEL_ID, contactId, thresholdIncTax),
  readThresholdIncTax: async () =>
    Number((await getCheckoutSettings()).freeMembershipThresholdIncTax) || 0,
  formatDate: formatMemberSince,
};

/**
 * The offer as a PAGE should describe it. A read that fails leaves the shopper without
 * a banner, which costs nothing — see `free-trial-offer.ts`.
 */
export async function resolveFreeTrialOffer(
  opts: Omit<FreeTrialRequest, "forGrant">
): Promise<FreeTrialOffer> {
  return buildFreeTrialOffer(readers, opts);
}

/**
 * The offer as the SUBSCRIBE ACTION must resolve it, at the moment the free period is
 * spent. Fails CLOSED: a failed eligibility read rejects rather than reading as "this
 * person has never had free months", because that mistake grants a second free period
 * and stamps it — the exact thing card ASTb3tCf exists to prevent. The action's own
 * try/catch turns the rejection into a plain "Failed to create subscription".
 */
export async function resolveFreeTrialGrant(
  opts: Omit<FreeTrialRequest, "forGrant">
): Promise<FreeTrialOffer> {
  return buildFreeTrialOffer(readers, { ...opts, forGrant: true });
}
