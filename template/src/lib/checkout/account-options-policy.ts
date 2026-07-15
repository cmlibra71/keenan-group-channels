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

/** True when `id` is offerable/acceptable under the account's allow-list (null ⇒ everything is). */
export function isPaymentMethodAllowed(id: string, allowed: string[] | null): boolean {
  if (!allowed) return true;
  return allowed.includes(id);
}

/**
 * Filter the channel's payment methods down to the account's allow-list. Called by the checkout
 * page (visibility); placeOrder authorizes the submitted method with isPaymentMethodAllowed against
 * the SAME resolved allow-list.
 */
export function filterPaymentMethodsForAccount<T extends { id: string }>(
  methods: T[],
  allowed: string[] | null
): T[] {
  if (!allowed) return methods;
  return methods.filter((m) => allowed.includes(m.id));
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
