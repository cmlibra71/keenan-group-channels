// ============================================================================
// Net-terms entitlement — the ONE answer to "is this contact entitled to defer
// payment on net terms right now?".
//
// Both the checkout page (visibility) and placeOrder (authorization) call this
// resolver, so what we show is exactly what we accept.
//
// Identity unification: the session subject is a CONTACT, and entitlement is
// resolved with accountService.resolveNetTermsForContact. Preferred arm: the
// contact's account MEMBERSHIPS (relational — staff/Zoey/activation-created,
// email-proven by construction). Fallback arm: the legacy email-string join
// (`via: "email"`). The fail-closed self-registered/unverified rule applies
// ONLY to the email arm — a membership row is an explicit staff-granted link,
// so an unverified marker must not revoke it — and is evaluated against the
// CONTACT's metafields. Guests (no session) never qualify.
// ============================================================================

import { accountService, contactService } from "@/lib/store";
import { deniedForUnverifiedSelfRegistration } from "@/lib/checkout/net-terms-policy";

export type NetTermsEntitlement = NonNullable<
  Awaited<ReturnType<typeof accountService.resolveNetTermsForContact>>
>;

export async function resolveNetTermsEntitlement(
  session: { email?: string; contactId?: number } | null
): Promise<NetTermsEntitlement | null> {
  if (!session?.contactId) return null;

  const netTerms = await accountService.resolveNetTermsForContact(session.contactId, {
    emailFallback: session.email ?? null,
  });
  if (!netTerms) return null;

  // Fail closed for self-registered, unverified contacts — but only when the
  // entitlement came from the weak email-string match.
  if (netTerms.via === "email") {
    try {
      const contact = (await contactService.getById(session.contactId)) as
        | { metafields?: Record<string, unknown> | null }
        | null;
      if (deniedForUnverifiedSelfRegistration(contact?.metafields)) return null;
    } catch {
      return null;
    }
  }

  return netTerms;
}
