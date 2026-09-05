import "server-only";

import {
  freePeriodEnds,
  freePeriodLabel,
  resolveFreeTrial,
  type FreeTrialDecision,
} from "@keenan/services/membership-trial";
import {
  CHANNEL_ID,
  getCheckoutSettings,
  readPriorFreeTrial,
  readQualifyingOrder,
} from "@/lib/store";
import { formatMemberSince } from "@/lib/member-date";
import { type FreeTrialView } from "./free-trial-copy";

/**
 * The free months on a Chefs Depot membership, resolved for ONE visitor (card ASTb3tCf).
 *
 * ONE ENTRY POINT ON PURPOSE. The checkout banner offers the free period, the subscribe
 * page repeats the offer, and `createSubscription` is the one that actually spends it.
 * All three call this, so a shopper cannot be promised a free period on one screen and
 * charged on the next. The arithmetic itself lives in `@keenan/services/membership-trial`
 * and is unit-tested there; this file only gathers the facts.
 *
 * NEVER TRUSTED FROM THE BROWSER. The decision is re-made server-side inside the action
 * that creates the subscription, from the same facts, so a stale checkout page cannot
 * buy a free period the person is not entitled to.
 */

export interface FreeTrialOffer {
  decision: FreeTrialDecision;
  /** The labels the customer-facing copy needs, already in Melbourne time and AUD. */
  view: FreeTrialView;
  /** The plan's free period in days, for the Stripe call. 0 when nothing is granted. */
  grantedDays: number;
  /**
   * True when the free period is earned by the BASKET in front of the shopper and no
   * order has been placed yet. The offer is real, but it cannot be taken until that
   * order exists — so the checkout says "place this order" and does NOT send them to
   * hand over a card first, which would land them on a page that (correctly) refused
   * the free months and charged them from day one.
   */
  pending: boolean;
}

/**
 * Customer-facing money: GST inclusive, 2dp, grouped. `$3,262.00`, never `$3262.00` —
 * these sentences sit beside an Order Summary that groups its thousands, and a figure
 * that does not is read as a different kind of number.
 */
function moneyLabel(amount: number): string {
  return `$${(Math.round(amount * 100) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Resolve the offer for `contactId` on this channel.
 *
 * `basketIncTax` is the GST-inclusive total in front of the shopper right now, when
 * there is one (the checkout). It is weighed against the threshold ALONGSIDE the orders
 * they have already placed, so the offer shown at the checkout is the same one the
 * subscribe page honours once that basket has become an order.
 *
 * A signed-out visitor has no history to check: they are treated as eligible, which is
 * true — they simply have to sign in before anything is granted, and the action re-runs
 * this with their real identity.
 */
export async function resolveFreeTrialOffer(opts: {
  contactId: number | null;
  /** `subscription_plans.trial_period_days` for the plan being joined. */
  trialDays: number;
  /** The plan's monthly price as stored (GST inclusive), for "…a month after that". */
  planPrice?: string | number | null;
  /** The basket in front of the shopper, GST inclusive. */
  basketIncTax?: number | null;
}): Promise<FreeTrialOffer> {
  const trialDays = Number(opts.trialDays) || 0;
  const settings = await getCheckoutSettings();
  const thresholdIncTax = Number(settings.freeMembershipThresholdIncTax) || 0;

  const priorTrial = opts.contactId
    ? await readPriorFreeTrial(CHANNEL_ID, opts.contactId).catch(() => null)
    : null;

  // The threshold can be met by the basket in front of them OR by an order they have
  // already placed — the offer is made at the checkout and spent on the subscribe page,
  // and by then the basket is gone. The larger of the two wins, so neither route is
  // penalised.
  let qualifyingAmountIncTax: number | null =
    opts.basketIncTax != null && Number.isFinite(opts.basketIncTax) ? Number(opts.basketIncTax) : null;
  let qualifyingOrderId: number | null = null;

  if (thresholdIncTax > 0 && opts.contactId && !priorTrial) {
    const order = await readQualifyingOrder(CHANNEL_ID, opts.contactId, thresholdIncTax).catch(
      () => null
    );
    if (order && (qualifyingAmountIncTax == null || order.total_inc_tax > qualifyingAmountIncTax)) {
      qualifyingAmountIncTax = order.total_inc_tax;
      qualifyingOrderId = order.order_id;
    }
  }

  const decision = resolveFreeTrial({
    trialDays,
    priorTrial,
    thresholdIncTax,
    qualifyingAmountIncTax,
    qualifyingOrderId,
  });

  const periodLabel = freePeriodLabel(trialDays);
  const priceNumber = Number(opts.planPrice);
  const priceLabel = Number.isFinite(priceNumber) && priceNumber > 0 ? moneyLabel(priceNumber) : null;

  // Granted on the strength of a basket that has not become an order yet? Then the
  // offer is conditional. `qualifyingOrderId` is set only when a REAL order cleared the
  // threshold, so its absence on a threshold grant means the basket did it.
  const pending = decision.granted && decision.basis === "threshold" && !decision.qualifyingOrderId;

  let view: FreeTrialView;
  if (decision.granted) {
    view = {
      kind: "free",
      periodLabel,
      endsLabel: formatMemberSince(freePeriodEnds(decision.days)),
      priceLabel,
      pending,
    };
  } else if (decision.reason === "already-used") {
    view = {
      kind: "used",
      periodLabel: freePeriodLabel(decision.priorTrial?.days ?? trialDays) || periodLabel,
      usedOnLabel: formatMemberSince(decision.priorTrial?.granted_at ?? null),
      priceLabel,
    };
  } else if (decision.reason === "below-threshold" && decision.shortfallIncTax != null) {
    view = {
      kind: "earn",
      periodLabel,
      shortfallLabel: moneyLabel(decision.shortfallIncTax),
      thresholdLabel: moneyLabel(thresholdIncTax),
    };
  } else {
    view = { kind: "paid" };
  }

  return { decision, view, grantedDays: decision.granted ? decision.days : 0, pending };
}
