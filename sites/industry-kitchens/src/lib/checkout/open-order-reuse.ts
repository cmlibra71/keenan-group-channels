/**
 * WHEN MAY A RETRIED CARD CHECKOUT REUSE THE CART'S OPEN ORDER? (judge round 2, R1)
 *
 * `placeOrder` reuses an open `awaiting_payment` Stripe order for the same cart so a double-press or
 * a retry after a network blip does not leave an orphan. But that order's LINES and TOTALS were
 * written on the first attempt: if the cart was re-priced since (customer-group prices, an account
 * price, an offer lapsing, a changed delivery), reusing it charged the NEW total against the OLD
 * lines — the order would record one amount and Stripe take another.
 *
 * So the open order is reused ONLY when its total matches the new total to the cent. Otherwise it is
 * REPLACED: its PaymentIntent is cancelled at Stripe (a `void` ledger row — not a completed payment,
 * so nothing is pushed to Xero, and no Xero invoice exists on an unpaid storefront order), the order
 * is cancelled (releasing any coupon uses it held), and a fresh order is written from the current
 * lines. If the old intent cannot be cancelled — it was confirmed in another tab and the money is
 * already moving — nothing new is created and the shopper is told the earlier payment is still being
 * processed, so a cart can never be charged twice.
 *
 * PURE: the decision only; the IO lives in `placeOrder`.
 */
export type OpenOrderDecision = "reuse" | "replace";

export function decideOpenOrderReuse(openOrderTotal: unknown, newTotal: number): OpenOrderDecision {
  const open = typeof openOrderTotal === "number" ? openOrderTotal : parseFloat(String(openOrderTotal ?? ""));
  if (!Number.isFinite(open) || !Number.isFinite(newTotal)) return "replace";
  return Math.round(open * 100) === Math.round(newTotal * 100) ? "reuse" : "replace";
}

export const EARLIER_PAYMENT_IN_PROGRESS_MESSAGE =
  "An earlier payment attempt for this cart is still being processed, so we haven't started a new one. Please check your email for an order confirmation before trying again, or contact us.";
