// ============================================================================
// "Can this shopper pay at all?" — and, when they can't, WHY, in one place so
// every customer-facing payment surface says the same thing (card N8kE8arY).
//
// Two DIFFERENT states used to share one message:
//
//  1. The STORE has no payment methods switched on. That is a real, supported
//     state: the order is still placed, with payment status "pending", and staff
//     chase the money (payment-methods register entry, recorded before this card).
//  2. The store HAS methods, but none of them are offerable to THIS shopper —
//     because the account's allow-list or its per-method "Staff only" access
//     removed them all. On Chefs Depot, which has exactly one enabled method,
//     that is the ONLY thing marking a method Staff only can produce.
//
// State 2 is not a configuration accident, it is a deliberate instruction from
// the sales desk: this customer does not pay online. So we refuse the money
// rather than book an unpaid order the shopper thinks is paid — the same call
// Zoey makes, and the same call the pay-a-quote screen already made (card
// 0Wy0xHuq greys its Pay button with a reason). What we show is what we accept:
// the page hides the Place Order path and placeOrder refuses the submission.
//
// Pure. No imports, no I/O — the checkout page, placeOrder, the quote page and
// payQuote all resolve through it.
// ============================================================================

export type PaymentAvailability =
  /** At least one method may be offered to this shopper. */
  | "available"
  /** The channel has no payment methods enabled at all (state 1 above). */
  | "store-unconfigured"
  /** The channel has methods; this account may use none of them (state 2 above). */
  | "account-restricted";

/**
 * Both counts must be taken over the SAME list, in the same state, or the count
 * and the rendered options disagree and the shopper is told the wrong story:
 * pass the customer-facing channel list and the list actually drawn on screen,
 * each after the finance floor has been applied.
 *
 * @param channelMethodCount how many methods the CHANNEL offers a customer on this cart
 * @param offeredMethodCount how many of those survive this shopper's own filters
 * @param shopperIsSignedIn whether there is an account to attribute a restriction to
 *        (a guest is false) — REQUIRED so every call site has to decide, the same
 *        reason `staffOnly` is required on the account-policy functions
 */
export function resolvePaymentAvailability(
  channelMethodCount: number,
  offeredMethodCount: number,
  shopperIsSignedIn: boolean
): PaymentAvailability {
  if (offeredMethodCount > 0) return "available";
  // Nothing offerable and NO account to blame. "Online payment isn't available on
  // your account" names something a guest does not have, and refusing them is not
  // an instruction anyone at the sales desk gave: fall to the store state, which
  // places the order unpaid exactly as a store with nothing switched on does.
  if (!shopperIsSignedIn) return "store-unconfigured";
  return channelMethodCount > 0 ? "account-restricted" : "store-unconfigured";
}

/**
 * What the CUSTOMER is told when their account leaves no payable method.
 *
 * Deliberately blames neither the store's configuration nor the shopper: it
 * names the account (which is where the restriction actually is, and what the
 * sales desk can change on a phone call) and gives them the one action open to
 * them. The two surfaces differ by one word — order / quote — on purpose.
 */
export const PAY_UNAVAILABLE_ACCOUNT_ORDER =
  "Online payment isn't available on your account — please contact us to arrange payment for this order.";

export const PAY_UNAVAILABLE_ACCOUNT_QUOTE =
  "Online payment isn't available on your account — please contact us to arrange payment for this quote.";

// There is deliberately NO constant here for "store-unconfigured": that branch
// keeps the wording and the behaviour it already had (order placed, payment
// status "pending"), because it is another card's recorded rule on this surface
// and nothing about this card touches it.
