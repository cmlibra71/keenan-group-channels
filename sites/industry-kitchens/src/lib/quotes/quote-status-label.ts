// ============================================================================
// How a quote's status is worded on the storefront.
//
// The wording is the PORTAL's wording, verbatim from QUOTE_STATUSES in
// src/constants/commerce-statuses.ts. That is deliberate: a customer on the phone
// to the office must be describing the same quote in the same words the person
// looking at the portal sees. Before this module the storefront invented its own
// lower-case vocabulary ("awaiting review", "quote ready", "ordered") which
// matched nothing anyone internal could search for.
//
// The last-resort fallback title-cases an unrecognised value with the portal's
// own humanizeStatus algorithm, so a status added to the lifecycle later reads as
// "Some New Status" rather than shipping `some_new_status` to a customer.
//
// Pure: no React, no DB, no server-only.
// ============================================================================

/** Quote status -> the portal's exact wording. Keep in step with QUOTE_STATUSES. */
const QUOTE_STATUS_LABELS: Record<string, string> = {
  created: "Created",
  quote_pending: "Quote Pending",
  quote_available: "Quote Available",
  open_change_request: "Open, Change Request",
  quote_accepted: "Quote Accepted",
  quote_on_hold: "On Hold",
  converted_to_order: "Converted to Order",
  quote_expired: "Quote Expired",
  quote_cancelled: "Quote Cancelled",
};

/**
 * snake_case / kebab-case -> Title Case.
 *
 * Same algorithm as the portal's humanizeStatus, so an unmapped status reads
 * identically on both sides of the business.
 */
function humanizeStatus(value: string): string {
  return value
    .trim()
    .split(/[_-]/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * The wording for a quote status.
 *
 * A blank / missing status reads as "Quote Pending" — the same default the quote
 * pages already apply when `quotes.status` is null, because a quote with no
 * status is one nobody has actioned yet.
 */
export function quoteStatusLabel(status: string | null | undefined): string {
  const key = (status ?? "").trim().toLowerCase();
  if (!key) return QUOTE_STATUS_LABELS.quote_pending;
  return QUOTE_STATUS_LABELS[key] ?? humanizeStatus(key);
}

/** Every status worded by name. Exported so the tests can sweep it. */
export const KNOWN_QUOTE_STATUSES: readonly string[] = Object.freeze(
  Object.keys(QUOTE_STATUS_LABELS)
);
