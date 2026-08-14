// ============================================================================
// L3 Account Options — the ONE answer to "what is this shopper's account allowed
// to do at checkout right now?" (allowed payment methods + minimum order).
//
// Mirrors lib/checkout/net-terms.ts exactly: the checkout page (visibility) and
// placeOrder (authorization) call this SAME resolver, so what we show is exactly
// what we accept. Server-side is authoritative — the client is never trusted.
//
// The tri-state collapse (NULL/[] = inherit, per-account override wins, min-order
// globals inherited from the ACCOUNT's origin channel — not the request channel)
// lives in @keenan/services `collapseAccountOptions` and is reached here through
// accountService.resolveAccountOptionsForContact. Do NOT re-derive it at call sites.
//
// Unlike net terms there is no fail-closed unverified-contact rule: account options
// RESTRICT rather than entitle, so a weaker email-arm match can only ever narrow what
// the shopper may do. Guests (no session) have no account ⇒ no per-account overrides;
// they remain subject to the channel-global minimums (see effectiveMinimums).
// ============================================================================

import { accountService } from "@/lib/store";
import type { CheckoutAccountOptions } from "@/lib/checkout/account-options-policy";

export type ResolvedCheckoutOptions = CheckoutAccountOptions & { accountId: number };

export async function resolveAccountOptions(
  session: { email?: string; contactId?: number } | null
): Promise<ResolvedCheckoutOptions | null> {
  if (!session?.contactId) return null;
  try {
    const options = await accountService.resolveAccountOptionsForContact(session.contactId, {
      emailFallback: session.email ?? null,
    });
    if (!options) return null;
    return {
      accountId: options.accountId,
      allowedPaymentMethods: options.allowedPaymentMethods,
      staffOnlyPaymentMethods: options.staffOnlyPaymentMethods,
      minOrderAmount: options.minOrderAmount,
      minOrderQty: options.minOrderQty,
    };
  } catch {
    // FAIL OPEN, deliberately, and it is worth being honest about what that now costs: this
    // resolver stopped being purely restrictive when staff-only access joined it. A DB blip means
    // no allow-list AND no staff-only list, so the shopper is offered every channel method —
    // including one the account marked Staff only. The house rule stands (a hiccup must never stop
    // a customer paying us, same as getContactPermissions), and both surfaces fail the SAME way
    // (null), so show and accept still agree. The exposure is one order on a method the sales desk
    // preferred staff to take, not a wrong price or an unauthorised account.
    return null;
  }
}
