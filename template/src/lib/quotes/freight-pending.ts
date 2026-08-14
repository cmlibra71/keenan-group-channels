import { evaluateGateA, type FreightGateLine } from "@keenan/services";

/**
 * Does this quote still owe a freight price?
 *
 * Every surface here used to answer that from the TOTAL alone — freight is
 * pending when the total carries none — and that was the whole story while
 * `shipping_cost` was the only place delivery could live.
 *
 * It stopped being the whole story when gate A of quote auto-conversion
 * (card 9XRQmaiz) started reading the other two places delivery actually lives:
 * a PRICED delivery line (which reps use far more than the delivery-price field
 * — 4,405 quotes carry one) and staff declaring Pickup or Free delivery
 * (`attributes.delivery_basis`, new on that card). Without this a pickup quote
 * is told on its own page, in its pro-forma and on the invoice it becomes that
 * "delivery is not included in this amount and will be quoted separately",
 * while the portal's gate treats the very same quote as delivery-complete.
 *
 * The rule the register records still holds exactly as written [card 0Wy0xHuq]:
 * **freight of zero means "to be quoted", not free.** Zero is still pending —
 * unless the quote says, in one of the three ways the business actually says it,
 * that delivery is already accounted for. A $0.00 `Delivery-Specialised-Request`
 * line is a REQUEST, not a price, and `evaluateGateA` rejects it, so the notice
 * stays on.
 *
 * The rule itself lives in `@keenan/services` (`freightGate.ts`, pure and unit
 * tested) so the portal and both storefronts ask ONE question, not three.
 */

export interface FreightPendingQuote {
  shipping_cost?: unknown;
  shipping_method?: unknown;
  items?: readonly FreightGateLine[] | null;
  attributes?: unknown;
}

/**
 * Is this quote's delivery ALREADY accounted for — charged, priced on a line, or
 * declared as pickup / free?
 */
export function quoteCarriesItsDelivery(quote: FreightPendingQuote | null | undefined): boolean {
  if (!quote) return false;
  const attrs = (quote.attributes ?? {}) as Record<string, unknown>;
  return evaluateGateA({
    shippingCost: quote.shipping_cost,
    shippingMethod: quote.shipping_method,
    items: Array.isArray(quote.items) ? (quote.items as FreightGateLine[]) : [],
    deliveryBasis: attrs.delivery_basis,
  }).passed;
}

/**
 * The single "does this document say Plus Freight?" question. `freightEx` is the
 * ex-GST delivery money already inside the total.
 */
export function quoteFreightStillPending(
  quote: FreightPendingQuote | null | undefined,
  freightEx: number
): boolean {
  if (Math.abs(freightEx) >= 0.005) return false;
  return !quoteCarriesItsDelivery(quote);
}
