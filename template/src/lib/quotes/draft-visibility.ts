/**
 * A staff-only DRAFT quote never reaches the storefront.
 *
 * The portal's "Duplicate to Draft" (Zoey's button) copies a quote — or an ORDER —
 * into a new quote parked on the `draft` status: an internal working copy staff
 * rework before anyone outside sees it. Both copy paths carry the original's
 * `contact_id` and `channel_id`, so the draft legitimately belongs to a real
 * customer's contact record. That is exactly why it has to be filtered here: a
 * signed-in customer's own account pages would otherwise list it.
 *
 * What a leaked draft would show is not cosmetic. It carries the negotiated
 * per-line prices staff are still arguing about internally — including, on an
 * order copy, the prices actually charged on a past order — plus a quote number,
 * line names and quantities. Product Brief §3: "Draft status invisible to
 * customers."
 *
 * The portal guards its own customer surfaces in
 * `keenan-group-portal → src/lib/quotes/customer-visibility.ts` (the /q link, the
 * print view, My Quotes, and the accept / cancel / items APIs). This module is the
 * same rule for the storefront account area, which is the MAIN logged-in customer
 * quote surface. Mirrored byte-for-byte in template/ and both sites/*.
 *
 * Three surfaces use it, and all three must:
 *   - the My Quotes list   (filter the row out entirely),
 *   - the quote detail page (`notFound()`, the same answer a stranger's quote gets),
 *   - the duplicate action  (refuse — otherwise a customer copies staff-only
 *     prices into a live quote of their own that renders every line back to them).
 *
 * Refusals say "not found" rather than "that's a draft": confirming a draft exists
 * is itself a disclosure.
 */

/**
 * The portal/services status code for a staff-only draft — `SYSTEM_QUOTE_STATUSES`
 * in @keenan/services seeds it as `draft` (sortOrder -1, hidePrices, staff-only).
 * Kept as a local constant so this stays a dependency-free leaf usable from a
 * server component, an action and a test alike.
 */
export const DRAFT_QUOTE_STATUS = "draft";

/** A quote row far enough resolved to answer "is this a staff-only draft?". */
export interface DraftVisibilityQuote {
  status?: string | null;
}

/**
 * True when this quote is a staff-only draft, i.e. must not appear on, be opened
 * from, or be copied out of any customer-facing page.
 */
export function isStaffOnlyDraft(quote: DraftVisibilityQuote | null | undefined): boolean {
  return (quote?.status ?? "") === DRAFT_QUOTE_STATUS;
}

/**
 * The customer's quotes with every staff-only draft removed.
 *
 * Written as a filter (rather than a service-level status exclusion) because the
 * account list deliberately does NOT use `listForCustomer` — it needs the submitted
 * `quote_pending` rows that helper hides — so the draft rule has to be applied on
 * the rows themselves.
 */
export function withoutStaffOnlyDrafts<T extends DraftVisibilityQuote>(quotes: readonly T[]): T[] {
  return quotes.filter((q) => !isStaffOnlyDraft(q));
}
