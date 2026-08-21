/**
 * Quote columns that must never reach a customer surface.
 *
 * `quoteService.getWithItems` is a SELECT *, and the storefront's own quote page
 * calls it. That was tolerable while `internal_notes` only ever held the
 * `/request-quote` contact line; card 9tbz3sBF split the staff screen's single
 * "Customer Notes" box into a CUSTOMER note and an INTERNAL sales note, so reps are
 * now invited to type things into it that the customer must never read — and the
 * Product Brief's rule for a customer-facing surface is to load only what you
 * render, because a dev build serialises every awaited value into the page and
 * redaction-AFTER-render leaks.
 *
 * Projecting the columns in SQL is the ideal; this is the same guarantee applied at
 * the first line after the read, before any render or serialisation, for a shared
 * service read that a dozen staff surfaces also use. It is a COPY, like
 * `redactQuotePrices`, because service rows can sit behind `unstable_cache` and a
 * mutated row would poison unrelated reads.
 */

/** Columns on `quotes` that belong to staff alone. */
export const STAFF_ONLY_QUOTE_FIELDS = ["internal_notes"] as const;

export function stripStaffOnlyFields<T extends object>(quote: T): T {
  const out: Record<string, unknown> = { ...(quote as Record<string, unknown>) };
  for (const f of STAFF_ONLY_QUOTE_FIELDS) delete out[f];
  return out as T;
}
