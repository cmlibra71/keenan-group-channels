// ============================================================================
// Customer Reference — the shopper's OWN order reference / purchase-order
// number, typed at the delivery step of checkout (Zoey parity, card rmHBw8vA).
//
// Trade customers order against a PO their accounts team issued; the invoice we
// send back has to carry it or it does not get paid. Zoey collects it at the
// delivery step, so we do too.
//
// It lands on the order as `orders.customer_po` — the SAME field the portal's
// Delivery card and the amend form already label "Customer Reference", and the
// first value the order's payment summary reads as the invoice reference.
//
// Pure + free text, deliberately: a reference is whatever the customer's own
// system calls it. The only rules are the ones the storage imposes.
// ============================================================================

/** `orders.customer_po` is varchar(100) — a longer value would be refused by Postgres. */
export const CUSTOMER_REFERENCE_MAX_LENGTH = 100;

/** Control characters (incl. the newlines a paste carries) are not references. */
function isControlChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

/**
 * Normalise a typed customer reference for storage.
 *
 * Control characters collapse to spaces, runs of whitespace collapse to one,
 * and the result is trimmed and capped at the column width. An empty or
 * whitespace-only value is `null`, not `""` — the field is optional, and an
 * empty string would render as a present-but-blank reference on the order
 * screen and on the invoice.
 */
export function normaliseCustomerReference(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = Array.from(raw)
    .map((ch) => (isControlChar(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, CUSTOMER_REFERENCE_MAX_LENGTH).trim();
}
