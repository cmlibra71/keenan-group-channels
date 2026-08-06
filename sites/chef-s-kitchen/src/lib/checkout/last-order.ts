import { cookies } from "next/headers";

// ============================================================================
// "Last order placed" breadcrumb.
//
// Placing an order empties the cart, and /checkout redirects an empty cart to
// /cart — so a shopper who navigates back to checkout after ordering (the Back
// button, a bookmark, a double-tap on Place Order) landed on an EMPTY SHOPPING
// CART instead of their confirmation. This short-lived cookie lets that guard
// send them to the order they just placed instead.
// ============================================================================

const LAST_ORDER_COOKIE = "last_order";
const LAST_ORDER_MAX_AGE = 60 * 30; // 30 minutes — long enough to cover a back-button return

export async function setLastOrder(orderNumber: string, paymentMethod: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LAST_ORDER_COOKIE, `${orderNumber}|${paymentMethod}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LAST_ORDER_MAX_AGE,
  });
}

export async function getLastOrder(): Promise<{ order: string; pm: string } | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LAST_ORDER_COOKIE)?.value;
  if (!raw) return null;
  const [order, pm = ""] = raw.split("|");
  return order ? { order, pm } : null;
}

/** Drop the breadcrumb. Sign-out calls this so the next person on a shared
 * device cannot open the previous customer's order confirmation. */
export async function clearLastOrder(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_ORDER_COOKIE);
}

/** The confirmation URL for a just-placed order, or null when there isn't one. */
export async function lastOrderConfirmationPath(): Promise<string | null> {
  const last = await getLastOrder();
  if (!last) return null;
  const pmParam = last.pm ? `&pm=${encodeURIComponent(last.pm)}` : "";
  return `/checkout/confirmation?order=${encodeURIComponent(last.order)}${pmParam}`;
}
