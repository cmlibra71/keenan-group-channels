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
      minOrderAmount: options.minOrderAmount,
      minOrderQty: options.minOrderQty,
    };
  } catch {
    // A resolver failure must not restrict a shopper who may have no restrictions at all, and must
    // not silently WIDEN one either — both surfaces (page + placeOrder) fail the same way (null),
    // so show and accept still agree.
    return null;
  }
}
