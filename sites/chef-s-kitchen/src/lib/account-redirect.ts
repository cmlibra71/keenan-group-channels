// Emailed account links — the "View your orders" button on an order confirmation,
// quote notifications — are always opened in a browser with no storefront session,
// so every `/account/**` guard bounces the customer to the sign-in panel. Carrying
// the destination through that bounce, and back out of the login/register actions,
// is what lands them on the page they actually clicked instead of a bare
// "My Account" with no order history and no way back.

/** Where to send a signed-out visitor who asked for `destination`. */
export function signInRedirect(destination: string): string {
  return `/account?next=${encodeURIComponent(destination)}`;
}

/**
 * Only same-site absolute paths are honoured, so a crafted `?next=` can never turn
 * the sign-in panel into an open redirect. Browsers read both `//host` and `/\host`
 * as protocol-relative URLs, so neither counts as a path.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Why the customer is looking at a sign-in panel they never asked for. */
export function signInPrompt(next: string): string {
  if (next.startsWith("/account/orders")) return "Sign in to see your order history.";
  if (next.startsWith("/account/quotes")) return "Sign in to see your quotes.";
  return "Sign in to continue.";
}
