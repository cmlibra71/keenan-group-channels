/**
 * Gathering the facts behind the free months, and turning them into what a shopper is
 * told (card ASTb3tCf).
 *
 * PURE-BY-INJECTION — no `server-only`, no `@/` aliases, no database of its own. The
 * three reads it needs are handed in, which is what lets the once-per-person guard be
 * unit-tested: `free-trial.ts` next door binds the real store readers, and
 * `free-trial-offer.test.ts` binds readers that throw.
 *
 * THE GRANT PATH FAILS CLOSED. `resolveFreeTrialOffer` is not only the banner's copy
 * resolver — `createSubscription` calls it at the moment the free period is SPENT. A
 * swallowed error from the eligibility read is indistinguishable from "this person has
 * never had free months", so a returning subscriber would be handed a second free
 * period and a fresh stamp, which is the one thing this card exists to prevent. So the
 * read is only softened where a failure costs nothing: `forGrant` lets the rejection
 * propagate, and the action's own try/catch turns it into a plain "Failed to create
 * subscription" for the shopper. That matches the sibling reads' intent — the
 * qualifying-order read already fails CLOSED (a null amount is below any threshold) and
 * the settings read is deliberately not caught at all.
 */

import {
  freePeriodEnds,
  freePeriodLabel,
  resolveFreeTrial,
  type FreeTrialDecision,
  type PriorFreeTrial,
} from "@keenan/services/membership-trial";
import { type FreeTrialView } from "./free-trial-copy";

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

/** The order that earns a free membership, as the store reader returns it. */
export interface QualifyingOrderRow {
  order_id: number;
  total_inc_tax: number;
}

/** Everything this module has to ask the outside world. */
export interface FreeTrialReaders {
  /** This person's earlier free period on this channel, if they have had one. */
  readPriorFreeTrial: (contactId: number) => Promise<PriorFreeTrial | null>;
  /** Their largest live order at or above the threshold, if any. */
  readQualifyingOrder: (
    contactId: number,
    thresholdIncTax: number
  ) => Promise<QualifyingOrderRow | null>;
  /** The storefront's free-membership order threshold, GST inclusive. 0 = none set. */
  readThresholdIncTax: () => Promise<number>;
  /** A date said the way a customer reads it, in the business's own timezone. */
  formatDate: (value: string | Date | null | undefined) => string | null;
}

export interface FreeTrialRequest {
  contactId: number | null;
  /** `subscription_plans.trial_period_days` for the plan being joined. */
  trialDays: number;
  /** The plan's monthly price as stored (GST inclusive), for "…a month after that". */
  planPrice?: string | number | null;
  /** The basket in front of the shopper, GST inclusive. */
  basketIncTax?: number | null;
  /**
   * The storefront's free-membership threshold, GST inclusive, when the CALLER already
   * holds it. The checkout does: it destructures the same `getCheckoutSettings()` a few
   * lines earlier and that read is not cached, so letting this module ask for it again
   * costs every non-member checkout render a second `channel_settings` round trip for a
   * number already in scope. Absent (the subscribe page, the subscribe action) and the
   * reader is used. Speed is a stakeholder-visible feature (Product Brief §3).
   */
  thresholdIncTax?: number | null;
  /**
   * True where this call is about to SPEND the free period rather than describe it.
   * The eligibility read then fails CLOSED: a database error refuses the subscription
   * instead of quietly granting a second free period. See the file header.
   */
  forGrant?: boolean;
}

/**
 * Customer-facing money: GST inclusive, 2dp, grouped. `$3,262.00`, never `$3262.00` —
 * these sentences sit beside an Order Summary that groups its thousands, and a figure
 * that does not is read as a different kind of number.
 */
export function moneyLabel(amount: number): string {
  return `$${(Math.round(amount * 100) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Resolve the offer for `opts.contactId` on this channel, using `readers` for every
 * fact it cannot compute.
 *
 * `basketIncTax` is the GST-inclusive total in front of the shopper right now, when
 * there is one (the checkout). It is weighed against the threshold ALONGSIDE the orders
 * they have already placed, so the offer shown at the checkout is the same one the
 * subscribe page honours once that basket has become an order.
 *
 * A signed-out visitor has no history to check, so the DECISION treats them as eligible
 * — which is the right default, because nothing is granted until they sign in and the
 * action re-runs this with their real identity. What they are TOLD is different: the
 * view is marked `identified: false` and the wording drops to a description ("free if
 * you have not had them before") rather than a promise, because a returning member who
 * already spent their free months and is signed out would otherwise read
 * "Free membership — 3 months" here and be charged from day one on the next screen.
 */
export async function buildFreeTrialOffer(
  readers: FreeTrialReaders,
  opts: FreeTrialRequest
): Promise<FreeTrialOffer> {
  const trialDays = Number(opts.trialDays) || 0;
  // The caller may already hold the threshold (the checkout does) — see
  // `FreeTrialRequest.thresholdIncTax`. Only ask the store when it does not.
  const thresholdIncTax =
    opts.thresholdIncTax != null && Number.isFinite(Number(opts.thresholdIncTax))
      ? Number(opts.thresholdIncTax) || 0
      : Number(await readers.readThresholdIncTax()) || 0;

  const contactId = opts.contactId;
  // FAILS CLOSED WHERE IT MATTERS. On the grant path a rejection propagates and no
  // subscription is created; on a display path a missing banner costs nothing, so the
  // page still renders.
  const priorTrial = contactId
    ? opts.forGrant
      ? await readers.readPriorFreeTrial(contactId)
      : await readers.readPriorFreeTrial(contactId).catch(() => null)
    : null;

  // The threshold can be met by the basket in front of them OR by an order they have
  // already placed — the offer is made at the checkout and spent on the subscribe page,
  // and by then the basket is gone. The larger of the two wins, so neither route is
  // penalised.
  let qualifyingAmountIncTax: number | null =
    opts.basketIncTax != null && Number.isFinite(opts.basketIncTax) ? Number(opts.basketIncTax) : null;
  let qualifyingOrderId: number | null = null;

  if (thresholdIncTax > 0 && contactId && !priorTrial) {
    const order = await readers.readQualifyingOrder(contactId, thresholdIncTax).catch(() => null);
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

  // Do we know WHO this is? A signed-out visitor has no history to check, so nothing
  // said to them about their free months can be a promise about THEM — see
  // `FreeTrialView.identified`.
  const identified = !!contactId;

  let view: FreeTrialView;
  if (decision.granted) {
    view = {
      kind: "free",
      identified,
      periodLabel,
      endsLabel: readers.formatDate(freePeriodEnds(decision.days)),
      priceLabel,
      pending,
    };
  } else if (decision.reason === "already-used") {
    view = {
      kind: "used",
      identified,
      periodLabel: freePeriodLabel(decision.priorTrial?.days ?? trialDays) || periodLabel,
      usedOnLabel: readers.formatDate(decision.priorTrial?.granted_at ?? null),
      priceLabel,
    };
  } else if (decision.reason === "below-threshold" && decision.shortfallIncTax != null) {
    view = {
      kind: "earn",
      identified,
      periodLabel,
      shortfallLabel: moneyLabel(decision.shortfallIncTax),
      thresholdLabel: moneyLabel(thresholdIncTax),
    };
  } else {
    view = { kind: "paid", identified };
  }

  return { decision, view, grantedDays: decision.granted ? decision.days : 0, pending };
}
