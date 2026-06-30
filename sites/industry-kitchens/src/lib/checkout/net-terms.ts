// ============================================================================
// Net-terms entitlement — the ONE answer to "is this customer entitled to defer
// payment on net terms right now?".
//
// Previously the decision was split: the checkout page resolved net terms with
// accountService.resolveNetTermsForEmail alone (to decide whether to SHOW the
// option), while placeOrder additionally applied the self-registered/unverified
// fail-closed rule (to AUTHORIZE it). So an unverified self-registered customer
// matching a B2B account email would SEE net terms, then be rejected at submit.
// Both surfaces now call this resolver, so visibility and authorization agree.
//
// Net Terms is account-gated: only a logged-in customer whose email maps (via
// contacts -> accounts) to an active account with net_terms_days > 0 qualifies,
// and self-registered, unverified customers are denied (see net-terms-policy.ts).
// Guests (no session) never qualify.
// ============================================================================

import { accountService, customerService } from "@/lib/store";
import { deniedForUnverifiedSelfRegistration } from "@/lib/checkout/net-terms-policy";

export type NetTermsEntitlement = NonNullable<
  Awaited<ReturnType<typeof accountService.resolveNetTermsForEmail>>
>;

export async function resolveNetTermsEntitlement(
  session: { email?: string; customerId?: number } | null
): Promise<NetTermsEntitlement | null> {
  if (!session?.email) return null;

  const netTerms = await accountService.resolveNetTermsForEmail(session.email);
  if (!netTerms) return null;

  // Fail closed for self-registered, unverified customers.
  if (session.customerId) {
    try {
      const customer = (await customerService.getById(session.customerId)) as
        | { metafields?: Record<string, unknown> | null }
        | null;
      if (deniedForUnverifiedSelfRegistration(customer?.metafields)) return null;
    } catch {
      return null;
    }
  }

  return netTerms;
}
