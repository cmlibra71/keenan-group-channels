/**
 * "Member since <date>" on the customer's account, written in the business's own
 * timezone (card pgRmsaTX).
 *
 * WHY THIS IS NOT A ONE-LINER INLINE. The account pages are SERVER components and the
 * site container has no TZ set, so Node runs in UTC. Melbourne is 10–11 hours ahead,
 * so a membership created at 2026-07-25 14:14 UTC began on the 26th of July here —
 * and two of the nine live Chefs Depot members are exactly that case. An unqualified
 * `toLocaleDateString()` told both of them they joined a day earlier than they did.
 *
 * Pure, so the real timestamps can be pinned in a test.
 */

/** The business runs on Melbourne time. */
export const BUSINESS_TZ = "Australia/Melbourne";

/**
 * The long, friendly form a customer reads ("26 July 2026"). Returns null when we
 * hold no usable date, so the caller renders nothing rather than "Invalid Date".
 *
 * Used for the RENEWAL date on the membership page as well as the join date. Those
 * two sit side by side and are minutes apart in the year, so they cannot be allowed
 * to disagree about which day it is — and the renewal date was previously a bare
 * `toLocaleDateString()`, with neither a locale nor a zone.
 */
export function formatMemberSince(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
