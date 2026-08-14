// ============================================================================
// The menu down the side of every signed-in account page.
//
// Which items exist is a CHANNEL-AGNOSTIC decision — the same list, in the same
// order, on every storefront — so it lives here as pure data rather than inside
// each site's component. What that list LOOKS like is per-channel and stays in
// each site's own AccountNav.tsx.
//
// Three items are conditional on the same feature flags the account dashboard
// already reads. A storefront with the flag off does not show the item at all
// (not greyed): a customer of a store that has no membership programme should
// never learn one exists.
//
// "Contact your rep" names the person looking after this customer's quotes —
// the rep assigned to their most recent quote, or the storefront's customer
// service desk when none is (card DIj4B7Gr). It sits directly under My Quotes
// because that is what it is about.
//
// Pure: no React (the icon is named, not imported), no DB, no server-only.
// ============================================================================

/** One row of the account menu. `href` absent = the item is an action, not a link. */
export interface AccountNavItem {
  /** Stable identifier; also names the icon each site's component maps. */
  key: string;
  label: string;
  href?: string;
}

export interface AccountNavFlags {
  subscriptionsEnabled: boolean;
  drawsEnabled: boolean;
  partnerOffersEnabled: boolean;
}

/**
 * The menu, in the order it is shown.
 *
 * Sign Out carries no href on purpose — it posts the `logout` server action, so
 * the component renders it as a form button rather than a link.
 */
export function buildAccountNavItems(flags: AccountNavFlags): AccountNavItem[] {
  const items: AccountNavItem[] = [
    { key: "dashboard", label: "Account Dashboard", href: "/account" },
    { key: "profile", label: "Account Details", href: "/account/profile" },
    { key: "security", label: "Password & Security", href: "/account/security" },
    { key: "orders", label: "Order History", href: "/account/orders" },
    { key: "quotes", label: "My Quotes", href: "/account/quotes" },
    { key: "contact", label: "Contact your rep", href: "/account/contact" },
  ];

  if (flags.subscriptionsEnabled) {
    items.push({ key: "membership", label: "Membership", href: "/account/membership" });
  }
  if (flags.drawsEnabled) {
    items.push({ key: "draws", label: "My Draws", href: "/account/draws" });
  }
  if (flags.partnerOffersEnabled) {
    items.push({ key: "partnerOffers", label: "Partner Offers", href: "/account/partner-offers" });
  }

  items.push({ key: "shop", label: "Continue Shopping", href: "/products" });
  items.push({ key: "signout", label: "Sign Out" });

  return items;
}

/**
 * Is `item` the page the customer is on?
 *
 * `/account` and `/products` match exactly — otherwise the dashboard item would
 * claim to be current on every account page, and Continue Shopping would light up
 * on every product page. Everything else matches by prefix so
 * /account/quotes/123 marks "My Quotes" and /account/orders/456 marks
 * "Order History".
 */
export function isAccountNavItemCurrent(item: AccountNavItem, pathname: string): boolean {
  if (!item.href) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (item.href === "/account" || item.href === "/products") return path === item.href;
  return path === item.href || path.startsWith(`${item.href}/`);
}
