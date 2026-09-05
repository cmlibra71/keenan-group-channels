/**
 * What a shopper is TOLD about the free months on a membership (card ASTb3tCf).
 *
 * PURE — no session, no database, no clock, no `@/` aliases — so the checkout banner,
 * the subscribe page and its unit tests all read the same sentences. Every date and
 * every amount arrives already formatted, because the caller is the only one that knows
 * the business timezone and the site's money format.
 *
 * WHY THE WORDING IS HERE AND NOT INLINE. Three surfaces make the same promise about
 * money — the checkout offers the free period, the subscribe page repeats it, and a
 * returning subscriber has to be told plainly why they are being charged from day one.
 * Wording that drifts between them is wrong customer-visible wording, which is one of
 * the two things we are not allowed to guess at (Product Brief §4).
 *
 * The join pitch itself is Tim's line, unchanged from card Nyp8bkPm — the amber banner
 * says it today and it must go on saying it for a shopper who is not being offered a
 * free period. Nothing here reintroduces the retired "Members save up to $X" estimate.
 */

/** Tim's join pitch (card Nyp8bkPm). The default headline whenever nothing is free. */
export const JOIN_PITCH = "Join the buying group and every line reprices from your next order.";

/** Which of the four states a visitor is in, with the labels their sentence needs. */
export type FreeTrialView =
  /**
   * They can have the free period. `pending` means it is THIS BASKET that earns it and
   * the order has not been placed yet — so the offer is real but conditional, and the
   * shopper must not be sent to hand over a card before the order that pays for it
   * exists. False means they have already earned it (or nothing has to be earned).
   */
  | {
      kind: "free";
      periodLabel: string;
      endsLabel: string | null;
      priceLabel: string | null;
      pending: boolean;
    }
  /**
   * A threshold is configured and it has not been reached. `shortfallLabel` is how much
   * more THIS basket needs (the checkout, which has one); `thresholdLabel` is the whole
   * amount (the subscribe page, which does not).
   */
  | { kind: "earn"; periodLabel: string; shortfallLabel: string; thresholdLabel: string }
  /** They have already had their free period — the card's whole point. */
  | { kind: "used"; periodLabel: string; usedOnLabel: string | null; priceLabel: string | null }
  /** No free period is on offer to anyone (the plan has none configured). */
  | { kind: "paid" };

export interface OfferCopy {
  /** The line that leads the banner. */
  headline: string;
  /** One plain sentence under it, or null when there is nothing more to say. */
  detail: string | null;
  /** What the button says. */
  cta: string;
}

/**
 * The checkout's join offer. `kind: "free"` is the one the card names explicitly: the
 * button stops saying "Join now" and says what is actually on the table.
 */
export function checkoutOfferCopy(view: FreeTrialView): OfferCopy {
  switch (view.kind) {
    case "free":
      return {
        headline: `Free membership — ${view.periodLabel}`,
        detail: view.pending
          ? pendingFreeDetail(view.periodLabel, view.priceLabel)
          : freeDetail(view.periodLabel, view.endsLabel, view.priceLabel),
        cta: `Free membership — ${view.periodLabel}`,
      };
    case "earn":
      return {
        headline: JOIN_PITCH,
        detail: `Spend ${view.shortfallLabel} more on this order and your first ${view.periodLabel} are free.`,
        cta: "Join members",
      };
    case "used":
      return {
        headline: JOIN_PITCH,
        detail: usedDetail(view.periodLabel, view.usedOnLabel, view.priceLabel, "this membership"),
        cta: "Join members",
      };
    default:
      return { headline: JOIN_PITCH, detail: null, cta: "Join members" };
  }
}

/**
 * The same facts on the subscribe page, where the shopper is about to hand over a card.
 * Returns null when there is nothing to add to what the page already says (the plan's
 * name and its monthly price).
 */
export function subscribeOfferCopy(view: FreeTrialView): string | null {
  switch (view.kind) {
    case "free":
      // Never the pending wording here: this page is reached with a card in hand, and
      // by the time somebody is on it either the order exists or it does not.
      return freeDetail(view.periodLabel, view.endsLabel, view.priceLabel);
    case "used":
      return usedDetail(view.periodLabel, view.usedOnLabel, view.priceLabel, "this membership");
    case "earn":
      // A threshold is configured and this person has not reached it. Saying nothing
      // here is what breaks the promise: somebody who came from the checkout offer has
      // to be told, before they pay, that the free months come with the ORDER.
      return `Your first ${view.periodLabel} are free on an order of ${view.thresholdLabel} or more. Join now and this membership is charged from today.`;
    default:
      return null;
  }
}

/**
 * The offer as it stands at a checkout, before the order exists. The free months are
 * real and this basket earns them — but only once the order is placed, so the sentence
 * says so rather than implying the shopper can take them right now.
 */
function pendingFreeDetail(periodLabel: string, priceLabel: string | null): string {
  const rolls = priceLabel
    ? ` It then continues at ${priceLabel} a month, and you can cancel any time before that.`
    : "";
  return `Place this order and your first ${periodLabel} are free.${rolls}`;
}

function freeDetail(
  periodLabel: string,
  endsLabel: string | null,
  priceLabel: string | null
): string {
  const rolls = priceLabel
    ? endsLabel
      ? ` It then continues at ${priceLabel} a month from ${endsLabel}, and you can cancel any time before that.`
      : ` It then continues at ${priceLabel} a month, and you can cancel any time before that.`
    : endsLabel
      ? ` Paid membership starts on ${endsLabel}, and you can cancel any time before that.`
      : "";
  return `Your first ${periodLabel} are free.${rolls}`;
}

/**
 * The refusal, in Tim's terms: the free period is claimable once, so say when theirs
 * ran rather than letting somebody discover the charge on their statement.
 */
function usedDetail(
  periodLabel: string,
  usedOnLabel: string | null,
  priceLabel: string | null,
  subject: string
): string {
  const when = usedOnLabel ? ` — it ran from ${usedOnLabel}` : "";
  const price = priceLabel ? `${priceLabel} a month` : "the standard monthly price";
  return `You have already had your ${periodLabel} free${when}, so ${subject} is ${price} from today.`;
}
