import { relativeRedirectTarget } from "../redirect-path";

/**
 * What a visitor meets once their enquiry is safely stored — card XBOxpQmd
 * (Steve, 2026-08-26: "No way to set the destination page … OR no way to change
 * what the confirmation message is").
 *
 * Both answers come off the FORM RECORD, and both are optional:
 *   • nothing set  → the standard confirmation panel, on the same page. That is
 *     what every form does today, and it is what an untouched form keeps doing.
 *   • a message    → shown in place of the form, in the author's own words.
 *   • a destination → wins: the submitter is sent there instead.
 *
 * The destination is re-checked HERE even though the portal normalised it on the
 * way in. This is the last thing between a stored value and the browser, and it
 * runs the same guard the storefront's redirect table goes through: a scheme is
 * refused outright, and `//host` or a backslash collapses to a local path (a
 * browser reads `/\evil.com` as `//evil.com` and leaves the site). A value we
 * cannot vouch for is DROPPED and the confirmation message shows instead —
 * a bad destination must never become a jump off the storefront, and must never
 * cost the visitor their confirmation either.
 *
 * Pure on purpose: no database, no Next imports, so it is unit-testable on its own.
 */
export function resolvePostSubmit(form: {
  confirmation_message?: unknown;
  redirect_url?: unknown;
}): { message?: string; redirectTo?: string } {
  const raw = form.confirmation_message;
  const message = typeof raw === "string" && raw.trim() ? raw : undefined;
  const redirectTo =
    typeof form.redirect_url === "string" ? (relativeRedirectTarget(form.redirect_url) ?? undefined) : undefined;
  return { ...(message ? { message } : {}), ...(redirectTo ? { redirectTo } : {}) };
}
