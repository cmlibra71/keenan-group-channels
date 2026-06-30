// Pure net-terms policy — no DB, no `@/` imports, so it is unit-testable in
// isolation (see net-terms-policy.test.ts). The impure resolver that looks up the
// B2B account and the customer record lives in net-terms.ts.

/**
 * Whether net terms must be DENIED because the customer is a self-registered,
 * unverified account. Net-terms entitlement is matched on the email string only,
 * and self-service registration never proves the registrant owns that inbox — so
 * anyone could register with a known B2B account's email and buy on terms. We fail
 * closed: only customers that did NOT self-register (staff / Zoey imports, which
 * carry no `self_registered` marker), or self-registered customers who have since
 * verified their email, keep their terms.
 */
export function deniedForUnverifiedSelfRegistration(
  metafields: Record<string, unknown> | null | undefined
): boolean {
  const meta = (metafields ?? {}) as Record<string, unknown>;
  return meta.self_registered === true && meta.email_verified !== true;
}
