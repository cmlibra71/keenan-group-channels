// ============================================================================
// L3 Account Options — the PURE checkout policy.
//
// Two decisions, one module, so the checkout PAGE (what we show) and placeOrder
// (what we accept) cannot drift apart — the same invariant the net-terms gate
// states: "what we show is exactly what we accept."
//
//  1. Which payment methods may this shopper see / use?  (account allow-list)
//  2. Does this cart clear the minimum order amount / quantity?
//
// The tri-state collapse (NULL = inherit, [] = inherit, enabled override wins)
// is NOT re-implemented here — it lives in @keenan/services
// `collapseAccountOptions`, surfaced by `accountService.resolveAccountOptionsForContact`.
// This module only consumes the ALREADY-COLLAPSED effective values.
// ============================================================================

/** The already-collapsed options for the shopper's account (null = no account ⇒ no overrides). */
export interface CheckoutAccountOptions {
  allowedPaymentMethods: string[] | null; // null = every channel method allowed
  /**
   * Of the allowed methods, the ones marked STAFF-ONLY on the account (Zoey's per-method
   * "Access: Admin Only"). This is a CUSTOMER surface, so they are subtracted here — staff keep
   * using them from the portal when they place an order, quote or payment for the account.
   * null = none are staff-only.
   */
  staffOnlyPaymentMethods: string[] | null;
  minOrderAmount: number | null; // null = no minimum
  minOrderQty: number | null;
}

/** The channel-global minimums a shopper WITHOUT an account (guest) is still subject to. */
export interface ChannelMinimums {
  minOrderAmountEnabled: boolean;
  minOrderAmount: number;
  minOrderQtyEnabled: boolean;
  minOrderQty: number;
}

export interface EffectiveMinimums {
  minOrderAmount: number | null;
  minOrderQty: number | null;
}

/**
 * The effective minimums for this checkout: an account's collapsed values (which already inherit
 * from / override the channel globals in the services resolver), else the channel globals for a
 * guest / account-less shopper. A disabled or zero global imposes no minimum, so an unconfigured
 * channel behaves exactly as it does today.
 */
export function effectiveMinimums(
  options: CheckoutAccountOptions | null,
  globals: ChannelMinimums
): EffectiveMinimums {
  if (options) {
    return {
      minOrderAmount: options.minOrderAmount && options.minOrderAmount > 0 ? options.minOrderAmount : null,
      minOrderQty: options.minOrderQty && options.minOrderQty > 0 ? options.minOrderQty : null,
    };
  }
  return {
    minOrderAmount:
      globals.minOrderAmountEnabled && globals.minOrderAmount > 0 ? globals.minOrderAmount : null,
    minOrderQty: globals.minOrderQtyEnabled && globals.minOrderQty > 0 ? globals.minOrderQty : null,
  };
}

/**
 * True when `id` is offerable/acceptable to THIS SHOPPER: on the account's allow-list (null ⇒ every
 * method is) and not marked staff-only. A staff-only method fails here exactly as an un-allowed one
 * does — the storefront is the customer, and the customer must neither see it nor be able to force
 * it through placeOrder.
 */
export function isPaymentMethodAllowed(
  id: string,
  allowed: string[] | null,
  staffOnly: string[] | null = null
): boolean {
  if (staffOnly?.includes(id)) return false;
  if (!allowed) return true;
  return allowed.includes(id);
}

/**
 * Filter the channel's payment methods down to what this shopper may use — the account's allow-list
 * minus its staff-only methods. Called by the checkout page (visibility); placeOrder authorizes the
 * submitted method with isPaymentMethodAllowed against the SAME resolved lists, so the two cannot
 * disagree about a staff-only method any more than they can about an un-allowed one.
 */
export function filterPaymentMethodsForAccount<T extends { id: string }>(
  methods: T[],
  allowed: string[] | null,
  staffOnly: string[] | null = null
): T[] {
  if (!allowed && !staffOnly) return methods;
  return methods.filter((m) => isPaymentMethodAllowed(m.id, allowed, staffOnly));
}

/** Money for a user-facing message: 250 → "$250.00". */
function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * The min-order gate. Returns a user-facing error message, or null when the cart clears both
 * minimums. Amount is compared on the INC-tax subtotal (what the shopper sees in the cart);
 * quantity on the total item count.
 */
export function minimumOrderError(
  cart: { subtotalIncTax: number; itemCount: number },
  minimums: EffectiveMinimums
): string | null {
  if (minimums.minOrderAmount != null && cart.subtotalIncTax < minimums.minOrderAmount) {
    return `Your order doesn't meet the minimum order amount of ${money(
      minimums.minOrderAmount
    )}. Your cart subtotal is ${money(cart.subtotalIncTax)} — please add more items.`;
  }
  if (minimums.minOrderQty != null && cart.itemCount < minimums.minOrderQty) {
    return `Your order doesn't meet the minimum order quantity of ${minimums.minOrderQty} item${
      minimums.minOrderQty === 1 ? "" : "s"
    }. Your cart has ${cart.itemCount} — please add more items.`;
  }
  return null;
}

/** The rejection message for a payment method the account isn't allowed to use. */
export function disallowedPaymentMethodError(): string {
  return "That payment method isn't available on your account. Please choose one of the payment methods shown at checkout.";
}

/**
 * Is this method offered on THIS CHANNEL to a CUSTOMER at all?
 *
 * The account allow-list narrows the channel's list; it never widens it, and it
 * is NULL (= "everything") for most shoppers. So `isPaymentMethodAllowed` alone
 * accepted any string a form posted: a `paymentMethod=silverchef` POST landed a
 * real order on a channel that had never enabled SilverChef, and a channel-level
 * staff-only method (Zoey's Send Invoice) could be forced through by a customer.
 * The page filters on the channel list; the sf-checkout rule is that every page
 * filter is duplicated here, so this is that duplicate.
 *
 * `customerMethods` is `checkoutSettings.customerPaymentMethods` — enabled, minus
 * channel staff-only (services `customerFacingPaymentMethods`, card NmAfwrdE).
 * An EMPTY method id keeps its existing meaning (an order taken with no payment
 * method, e.g. a specialised delivery held for a freight quote) and is not
 * gated here.
 */
export function isPaymentMethodOnChannel(
  id: string,
  customerMethods: readonly { id: string }[]
): boolean {
  if (!id) return true;
  return customerMethods.some((m) => m.id === id);
}

/** The rejection for a method this storefront does not offer customers. */
export function unavailablePaymentMethodError(): string {
  return "That payment method isn't available on this store. Please choose one of the payment methods shown at checkout.";
}
