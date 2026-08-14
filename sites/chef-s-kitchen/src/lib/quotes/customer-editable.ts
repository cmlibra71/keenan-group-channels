/**
 * When may a CUSTOMER change the items on their own quote?
 *
 * Byte-for-byte mirror of the portal's `src/lib/quotes/customer-editable.ts`,
 * exactly as `price-visibility.ts` mirrors `accept-state.ts`. The emailed quote
 * link (portal `/q/{uuid}`) and this account page must offer the same edit, or a
 * customer gets a different answer depending on which one they opened
 * [cards 5bZsm1MF, FPfvaYLp]. If you change one, change all three copies
 * (template plus both sites) AND the portal's.
 *
 * The three live states a customer may edit in:
 *   - `quote_pending`      their request, not yet priced by us;
 *   - `quote_available`    priced and sent — an edit re-opens it as a change request;
 *   - `open_change_request` a change request already open — keep editing, and
 *                          change a quantity back if they want (Steve, 2026-08-09).
 *
 * Everything else is closed: `draft` is staff-only (and 404s before this is
 * reached), and accepted / converted / expired / cancelled / on-hold quotes are
 * settled — an accepted quote is price-locked like an invoice.
 */

/** Live statuses in which a customer may change quantities / remove lines. */
export const CUSTOMER_EDITABLE_STATUSES = new Set([
  "quote_pending",
  "quote_available",
  "open_change_request",
]);

/**
 * Whether the quote's status allows customer item edits. The caller must ALSO
 * check the quote's own `allow_edit_items` permission — this answers the status
 * half of the question only.
 */
export function isCustomerEditableStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && CUSTOMER_EDITABLE_STATUSES.has(status);
}

/** The quote's own `permissions` bag allows item edits. */
export function quoteAllowsItemEdits(
  permissions: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(permissions && permissions.allow_edit_items === true);
}
