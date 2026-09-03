/**
 * Where THIS customer's tax invoice PDF lives (card EizZjaY3).
 *
 * Steve's complaint on that card is that a paid order's tax invoice existed — it is attached to
 * the confirmation email and named on every screen — and the customer had no way to fetch it
 * again. This is that way: `/account/orders/[id]` renders it as a download.
 *
 * The document itself is rendered by the PORTAL, from the order's rows as they stand right now
 * (`/invoice/document`), because that is where the one invoice recipe lives — the same build the
 * emailed invoice and the paid-order confirmation attach. A storefront copy of that recipe would
 * be a second rendering of an invoice to keep in step, which is exactly what the portal register
 * forbids.
 *
 * Keyed on the ORDER'S UUID, never its id: a Chefs Depot order number is an enumerable sequence
 * and this document is served without a session, so the credential has to be the unguessable one.
 *
 * `PORTAL_BASE_URL` is the same env var the quote acknowledgement, the finance application and the
 * checkout's staff alerts already resolve the portal through, with the same live default.
 *
 * Pure: an order with no uuid gets NO link rather than a link to a 404.
 */
export function invoiceDocumentUrl(orderUuid: string | null | undefined): string | null {
  const uuid = typeof orderUuid === "string" ? orderUuid.trim() : "";
  if (!uuid) return null;
  const base = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/+$/, "");
  return `${base}/invoice/document?o=${encodeURIComponent(uuid)}`;
}
