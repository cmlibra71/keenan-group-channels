// ============================================================================
// Card entry at checkout: when to refuse the submit, what to say, and how many
// times a Stripe confirmation may run (card TT3DGpsE).
//
// Two defects lived here, and they compounded each other:
//
//  1. NOTHING refused a submit with the card box empty. `placeOrder` ran, a real
//     `awaiting_payment` order was written, Stripe was asked to confirm a card
//     that had never been typed, and it rejected it. The shopper was left with an
//     order they could not pay. Card data never touches our server (Stripe's
//     element holds it), so completeness is only knowable in the browser — this
//     is a PAGE guard, and it moves no server-side refusal into the client. The
//     sf-checkout rule that refusals live in `placeOrder` is untouched: every
//     refusal `placeOrder` already makes still runs, and skipping this guard
//     cannot buy anything, because only the portal's Stripe webhook ever marks an
//     order paid.
//
//  2. The confirm effect used `stripeProcessing` as BOTH its guard and one of its
//     dependencies. A rejected confirmation set it back to false, which re-fired
//     the effect on an unchanged result, which confirmed again, which failed
//     again — for ever. That is the flicker between the card box and the order
//     step that Chris reported.
//
// The fix for (2) is one confirmation per placeOrder RESULT, and the distinction
// matters: it is deliberately not one per client secret. `placeOrder`'s
// idempotency branch reuses the open `awaiting_payment` order for the same cart
// and `createStripePaymentIntent` is idempotent on (orderId, amount), so a
// shopper retrying after a DECLINE gets the SAME client secret back. Keying the
// guard on the secret would refuse to confirm the retry and leave them unable to
// pay at all — a worse payment bug than the loop. Each press of Pay produces a
// fresh result object, so keying on the result gives exactly one confirmation per
// press.
//
// Pure. No imports, no I/O.
// ============================================================================

/**
 * Shown against the card box when Pay is pressed with the card blank or half
 * typed and Stripe has said nothing itself.
 *
 * A completely empty element reports no error of its own — `error` on Stripe's
 * change event is only populated for input it can already tell is wrong — so
 * without this sentence the shopper presses Pay and NOTHING happens.
 */
export const CARD_DETAILS_REQUIRED = "Please enter your card details to continue.";

/**
 * Does this submit have to be stopped before it reaches `placeOrder`?
 *
 * Only ever true on the card method, and only where there is actually something
 * to charge. Every other method (bank transfer, net terms, finance, an
 * unconfigured store) is untouched.
 *
 * `placeOrder` knows TWO shapes that take no payment method at all, and this
 * guard has to know both of them or it refuses a submit the server would have
 * been happy to take (`effectivePaymentMethod` is `""` in each — see
 * `lib/actions/checkout.ts`, `heldForSpecialised || nothingToPay`):
 *
 *  - a held specialised bulky delivery, which is quoted and paid later; and
 *  - a ZERO-VALUE cart. That is a real, live flow (card NmAfwrdE: 316 such Zoey
 *    orders, last used 3 August), and it is easy to land in by accident — the
 *    card method is the DEFAULT selection on Chefs Depot, and ~1,968 visible
 *    products carry no price. There is nothing to charge, Stripe refuses a $0
 *    PaymentIntent outright, and the order is simply placed unpaid for staff to
 *    close off. Demanding a card number for $0.00 would strand that shopper on
 *    the checkout for ever.
 */
export function cardEntryBlocksSubmit(input: {
  /** The method the shopper has selected. */
  paymentMethod: string;
  /** Whether the card element is actually in play (a publishable key exists). */
  cardFormMounted: boolean;
  /** Specialised bulky delivery: the order is held and no card is taken. */
  heldForSpecialised: boolean;
  /**
   * What the shopper is being asked to pay, GST-INCLUSIVE — the same figure the
   * summary's Total row shows, and the same basis as `placeOrder`'s
   * `nothingToPay`. `<= 0` (or an unusable number) means no card is taken.
   */
  payableTotalIncTax: number;
  /** Stripe's own verdict, from the element's change event. */
  cardComplete: boolean;
}): boolean {
  if (input.heldForSpecialised) return false;
  // Written as `!(x > 0)` on purpose: a NaN total is not something to charge for
  // either, and must never become a refusal the shopper cannot clear.
  if (!(input.payableTotalIncTax > 0)) return false;
  if (input.paymentMethod !== "stripe") return false;
  if (!input.cardFormMounted) return false;
  return !input.cardComplete;
}

/**
 * The ONE message the card box shows.
 *
 * Stripe's words win where it gave us any ("Your card number is incomplete."),
 * because they name the actual field; our plain English covers the blank box it
 * says nothing about. Never both — two messages about one box is the flicker
 * this card exists to remove.
 */
export function cardEntryMessage(
  stripeError: string | null | undefined,
  refusedForIncompleteCard: boolean
): string | null {
  if (stripeError) return stripeError;
  return refusedForIncompleteCard ? CARD_DETAILS_REQUIRED : null;
}

/**
 * May the Stripe confirmation run for this `placeOrder` result?
 *
 * `alreadyConfirmed` is the result a confirmation was last started for. Identity,
 * not the client secret — see the header for why the secret is the wrong key.
 */
export function shouldConfirmStripeResult(
  alreadyConfirmed: object | null,
  result: object | null | undefined
): boolean {
  if (!result) return false;
  return alreadyConfirmed !== result;
}
