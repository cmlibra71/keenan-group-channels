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
 *
 * Control characters have to go before that test, not after it: a browser strips
 * TAB, CR and LF out of a URL BEFORE parsing it, so "/<TAB>/evil.example" reaches
 * the parser as "//evil.example" and resolves to https://evil.example/ even though
 * it never literally started with "//". Rejecting the whole C0 range (plus DEL)
 * also keeps CR/LF out of the `Location` / `x-action-redirect` header, where Node
 * would otherwise throw ERR_INVALID_CHAR and 500 a customer-facing page.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null;
  for (const ch of next) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return null;
  }
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/**
 * Why the customer is looking at a sign-in panel they never asked for. Order
 * confirmations go to guest checkouts too, and a guest has no password yet — so
 * the order prompt points at creating an account rather than only at signing in.
 */
export function signInPrompt(next: string): string {
  if (next.startsWith("/account/orders")) {
    return "Sign in to see your order history. If you checked out as a guest, create an account with the same email address and your orders will be here.";
  }
  if (next.startsWith("/account/quotes")) return "Sign in to see your quotes.";
  return "Sign in to continue.";
}
