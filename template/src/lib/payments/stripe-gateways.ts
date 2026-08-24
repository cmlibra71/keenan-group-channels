// Pure Stripe-gateway helpers — no DB, no `@/` imports, so they are unit-testable
// in isolation (see stripe-gateways.test.ts). The impure resolver that fetches the
// payment_gateways setting and applies the mode-match lives in gateway.ts.

export type StripeGatewayEntry = {
  provider: string;
  credentials: Record<string, string>;
  enabled?: boolean;
  testMode?: boolean;
};

// The enabled-entry filter that used to live here is now `enabledGatewaysOfProvider`
// in @keenan/services (card OHDx84DK): with a channel list AND a global list to
// filter, and a portal that filters the same lists, a second copy of "what counts
// as enabled" is a second answer waiting to happen.

/**
 * What the browser hands `stripe.confirmCardPayment()` — card b88eIfaS.
 *
 * The PaymentIntent already carries the buyer's name and address on `shipping`
 * (stamped server-side from the ORDER by `@keenan/services`). This is the other
 * half: the payment method the browser builds carries `billing_details`, which is
 * where Stripe Radar reads the customer's NAME, EMAIL and BILLING ADDRESS. Without
 * it the Dashboard's Risk analysis reads "Name: Not provided", "Customer email: Not
 * provided" and every billing/shipping/IP distance "Not available".
 *
 * `billing_details.email` is a Radar signal and does NOT make Stripe send anything.
 * It is deliberately NOT `receipt_email`: a Stripe-sent receipt is a second branded
 * mail on top of ours whichever account sends it (card EInDib45 — found when one
 * account served both storefronts under Industry Kitchens' business name, and the
 * rule survives card OHDx84DK giving a storefront its own account). The account's
 * "Successful payments" switch is still
 * on. The shopper's one email per order is our own branded confirmation.
 *
 * The details come back from `placeOrder`, derived from the order that was just
 * written, so what Stripe is told and what the order says are one derivation.
 */
export type ConfirmBillingDetails = {
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
};

export function cardConfirmParams(
  card: unknown,
  billingDetails?: ConfirmBillingDetails | null
): { payment_method: { card: unknown; billing_details?: ConfirmBillingDetails } } {
  // An EMPTY object is not sent: Stripe would take it as "the customer supplied
  // nothing", which is exactly the state this card exists to leave behind.
  const usable = billingDetails && Object.keys(billingDetails).length > 0 ? billingDetails : null;
  return { payment_method: { card, ...(usable ? { billing_details: usable } : {}) } };
}
