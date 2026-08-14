// ============================================================================
// What the customer's order document is CALLED.
//
// Tim's global naming ruling (portal card RvWcoPEe, 2026-08-07 and 2026-08-10):
// an order is a "Pro-Forma Tax Invoice" until money arrives, and a "Paid Tax
// Invoice Receipt" once ANY payment has been received — a deposit counts — with
// the balance still owing stated on the document. It is the same wording on the
// printed and emailed documents, in the portal, and on the customer's own
// logged-in pages here: "It should have the same naming convention for these
// customers" (Tim, answering whether the website pages change too).
//
// The portal twin is `src/lib/orders/document-naming.ts`; the rule is duplicated
// rather than shared because the storefronts take nothing from the portal, and
// it is pinned by tests on both sides so the two cannot drift into telling one
// customer two different things about the same order.
// ============================================================================

/** The document before any money has arrived. */
export const PRO_FORMA_TAX_INVOICE = "Pro-Forma Tax Invoice";

/** The document once any money has arrived — including a part payment. */
export const PAID_TAX_INVOICE_RECEIPT = "Paid Tax Invoice Receipt";

export type OrderDocumentName =
  | typeof PRO_FORMA_TAX_INVOICE
  | typeof PAID_TAX_INVOICE_RECEIPT;

/** Sub-cent tolerance, so a rounding crumb is not treated as a payment. */
const EPSILON = 0.005;

/**
 * Statuses that assert money HAS been received at some point, even when this
 * order carries no transaction rows to prove it — every Zoey-era order is marked
 * paid with an empty ledger, and a refund can only follow a payment.
 */
const PAYMENT_RECEIVED_STATUSES = new Set([
  "paid",
  "captured",
  "completed",
  "partially_paid",
  "partially_refunded",
  "refunded",
  "refund_in_progress",
]);

/** True once any payment has landed against the order. */
export function hasPaymentLanded(input: {
  amountPaid?: number | null;
  paymentStatus?: string | null;
}): boolean {
  const paid = Number(input.amountPaid ?? 0);
  if (Number.isFinite(paid) && paid > EPSILON) return true;
  return PAYMENT_RECEIVED_STATUSES.has(String(input.paymentStatus ?? "").trim().toLowerCase());
}

/** The document's name for this order, right now. */
export function orderDocumentName(input: {
  amountPaid?: number | null;
  paymentStatus?: string | null;
}): OrderDocumentName {
  return hasPaymentLanded(input) ? PAID_TAX_INVOICE_RECEIPT : PRO_FORMA_TAX_INVOICE;
}
