// ============================================================================
// The one sentence a shopper reads when a product staff switched off for online
// ordering is refused — card 7vu2iEEZ's refusal, surfaced by card 1sgz4B3v.
//
// It lives in its own module because BOTH ends need it and they cannot share a
// file: `lib/actions/cart.ts` is a "use server" module (which may export async
// functions only), and the cart row that RENDERS the refusal is a client
// component. One constant, so the message the server returns and the message the
// row shows on a line that is already restricted can never drift apart.
//
// Not in `@keenan/services`: the portal never says this. Listed in
// `orchestrator/shared-modules.json`, so both storefronts say it word for word.
// ============================================================================

/**
 * Returned by `addToCart` / `updateCartItem` for `products.restrict_add_to_cart`,
 * and shown on a cart line carrying that flag.
 *
 * It names what to do instead, because there is no availability wording left on
 * either storefront to explain a refused control (card CXnP1lrL removed it all)
 * and `sf-catalog-browse`'s rule is that a control never silently does nothing.
 */
export const CART_RESTRICTED_ERROR =
  "This product isn't available to order online — please add it to a quote.";

/**
 * What ONE cart line says under its name — card 1sgz4B3v.
 *
 * Precedence, and it matters: what the SERVER said about the last change wins.
 * A line whose product is restricted can still be refused for some OTHER reason
 * (a required customisation, a catalogue-scope refusal), and answering that with
 * the standing sentence would tell the shopper the wrong thing about the press
 * they just made. With nothing refused, the standing reason shows instead — a
 * restricted line explains itself before it is touched, which is the point of
 * marking it at all. Neither: the line says nothing.
 */
export function cartLineNotice(
  refusal: string | null | undefined,
  restricted: boolean
): string | null {
  const said = (refusal ?? "").trim();
  if (said) return said;
  return restricted ? CART_RESTRICTED_ERROR : null;
}

/**
 * The same refusal with the LINE NAMED, for `placeOrder` (card 1sgz4B3v).
 *
 * Until this, Place Order answered a cart holding a restricted product with "One
 * of the items in your cart isn't available to order online at that quantity.
 * Please review your cart, or ask us for a quote." — which names no line, while
 * nothing in the cart marked one either. Harmless when no product carried the
 * flag; the moment thousands do, every open cart holding one is refused here
 * with nothing for the shopper to find. So the sentence says WHICH item, and the
 * cart row carrying the flag says it too.
 *
 * A missing name falls back to the old sentence rather than to an empty quote:
 * a refusal that names nothing still beats a refusal that reads as broken.
 */
export function restrictedCheckoutMessage(productName?: string | null): string {
  const name = (productName ?? "").trim();
  return name
    ? `${name} isn't available to order online — please remove it from your cart, or ask us for a quote.`
    : "One of the items in your cart isn't available to order online. Please review your cart, or ask us for a quote.";
}

/**
 * The quantity half of the same refusal — a product staff set to refuse
 * out-of-stock buys, short of stock. Named for the same reason.
 */
export function quantityRefusedCheckoutMessage(productName?: string | null): string {
  const name = (productName ?? "").trim();
  return name
    ? `${name} isn't available in the quantity you have asked for. Please reduce it or remove it from your cart, or ask us for a quote.`
    : "One of the items in your cart isn't available to order online at that quantity. Please review your cart, or ask us for a quote.";
}
