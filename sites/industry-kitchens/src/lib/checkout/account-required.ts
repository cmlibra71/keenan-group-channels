// Account-required checkout — the "no guest checkout" gate.
//
// Industry Kitchens sells the way it always has on Zoey: a shopper must be
// signed in (or create an account) before they can check out. Chefs Depot
// deliberately keeps guest checkout, and a CD guest order links itself to an
// account with the same email later (card yUNl5TPq), so this is a PER-CHANNEL
// switch, never a site-wide one.
//
// The switch is the channel setting `require_account_to_checkout`, edited on the
// portal's Settings -> Checkout screen. UNSET MEANS GUEST CHECKOUT, which is what
// every channel does today — a channel that has never heard of this setting keeps
// behaving exactly as it did.
//
// One module, two callers, same answer: the checkout PAGE decides whether to show
// the sign-in step instead of the form, and `placeOrder` decides whether to accept
// the order. Show equals accept — adding the check to the page alone would leave a
// guest able to submit the form the page refused to draw.

/** channel_settings key. Boolean; absent/false = guest checkout allowed. */
export const ACCOUNT_REQUIRED_SETTING = "require_account_to_checkout";

/**
 * What the shopper is told, in one place, so the page gate and the server
 * refusal cannot drift into two different explanations of the same rule.
 * Zoey's wording is "You must log-in or create an account to checkout"; the
 * storefront says "sign in" everywhere else, so it says "sign in" here too.
 */
export const SIGN_IN_REQUIRED_MESSAGE =
  "You must sign in or create an account to check out.";

/**
 * Does this shopper have to sign in before checkout?
 *
 * @param requireAccount the channel's `require_account_to_checkout` setting
 * @param signedIn       whether there is a storefront session
 */
export function checkoutNeedsSignIn(requireAccount: boolean, signedIn: boolean): boolean {
  return requireAccount && !signedIn;
}
