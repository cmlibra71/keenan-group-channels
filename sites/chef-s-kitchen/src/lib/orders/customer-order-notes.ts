/**
 * Notes staff published to the customer from the portal's Order History panel (card mlZ3aTT1).
 *
 * The portal's Submit Note form carries a "Visible on Store Frontend" tick. Ticking it appends the
 * note to `orders.metafields.customer_order_notes`; this is the reader for the other end of that.
 *
 * Two things it deliberately does NOT do:
 *
 *  • It never reads the audit trail. Order History is staff-only for the life of the order and
 *    holds every internal note; the published subset is its own projection on the order row, so a
 *    customer-facing page loads only what it renders rather than filtering after the read.
 *  • It carries no status. The portal's status set holds internal and finance-company words
 *    (SILVERCHEF, SKOPE FUNDING, Deposit Paid) and the only status vocabulary a customer may read
 *    is the closed eight-stage plain set in `order-status-label.ts` (uvRji87U). A published note is
 *    the staff member's own sentence and a date, and nothing else.
 *
 * Pure — a twin of the portal's `src/lib/orders/history-note.ts` reader, deliberately kept to the
 * same tolerant shape so a malformed entry costs the note, never the page.
 */

/** The metafield the portal publishes into. */
export const CUSTOMER_ORDER_NOTES_METAFIELD_KEY = "customer_order_notes";

export interface CustomerOrderNote {
  id: string;
  note: string;
  at: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Published notes on this order, oldest first. Anything that is not our shape is dropped. */
export function readCustomerOrderNotes(
  metafields: Record<string, unknown> | null | undefined
): CustomerOrderNote[] {
  const raw = metafields?.[CUSTOMER_ORDER_NOTES_METAFIELD_KEY];
  if (!Array.isArray(raw)) return [];
  const out: CustomerOrderNote[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const note = str(r.note);
    const id = str(r.id);
    if (!note || !id) continue;
    out.push({ id, note, at: str(r.at) });
  }
  return out;
}
