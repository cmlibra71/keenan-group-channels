import { lineUnitPrice } from "./order-draft";

/**
 * NEVER CHARGE A GOODS TOTAL THE SHOPPER WAS NOT SHOWN.
 *
 * The checkout page renders the cart lines as they stand at render time and posts back the goods
 * total it priced them at (`shown_goods_total`). `placeOrder` re-prices the lines (account contract
 * prices, customer-group prices, membership expiry…) and compares: if the money moved, the order is
 * refused, the corrected prices are already saved on the cart, and the form refreshes the page so
 * the new lines and totals are on screen — the shopper then presses Pay again at the price they can
 * see (an explicit re-confirm). A stale tab that presses Pay again posts the OLD figure and is
 * refused again, so the guard is server-side and does not depend on the refresh happening.
 *
 * PURE, and computed on BOTH sides with the same function over the same lines
 * (`lineUnitPrice × quantity`, the figure `buildLineItems` bills), so an unchanged cart always
 * agrees to the cent.
 */
export function goodsTotalOf(items: ReadonlyArray<{ sale_price: string | null; list_price: string; quantity: number }>): number {
  let total = 0;
  for (const item of items) total += lineUnitPrice(item) * item.quantity;
  return Math.round(total * 100) / 100;
}

/** The posted figure differs from the lines about to be billed. A missing figure never refuses. */
export function goodsTotalMoved(shown: unknown, items: Parameters<typeof goodsTotalOf>[0]): boolean {
  const n = typeof shown === "number" ? shown : parseFloat(String(shown ?? ""));
  if (!Number.isFinite(n)) return false;
  return Math.abs(goodsTotalOf(items) - n) > 0.005;
}

/** What the shopper is told; worded for guests and trade alike. */
export const PRICES_CHANGED_MESSAGE =
  "Some prices in your cart have just been updated, so your total has changed. Nothing was charged — please check the updated total below and place your order again.";
