import type { ReactNode } from "react";
import type { CheckoutSettings } from "@keenan/services";
import type { PayBalanceDecision } from "./pay-balance";
import type { PayBalanceOrderRow } from "./pay-balance-context";

// ============================================================================
// THE ONE PER-SITE SEAM in the customer order detail page.
//
// The page itself (`app/account/orders/[id]/page.tsx`), both of its sections and
// every rule module under `lib/orders/` are byte-identical on every storefront —
// that is the point of card D045H6Zh, which existed because Chefs Depot had an
// order page and Industry Kitchens did not. Only THIS file differs, and it
// answers one question: may this customer settle the balance by card here, and
// what control do we draw if so.
//
// This is the DEFAULT implementation — card payment on an existing order is not
// offered. It does no I/O whatsoever: no checkout-settings read, no
// account-options read, no role lookup, no Stripe gateway resolution, and it
// reaches no server action that could move money.
//
// Chefs Depot overrides it with the real thing (card Sh03niVC — its own copy of
// this file wires `resolvePayBalance` and `PayBalancePanel`). Industry Kitchens
// keeps this default, so its order page is READ-ONLY. Tim's ruling on Sh03niVC
// was "same on both sites" (vault, 2026-08-10) and it is still unmet on IK: the
// route existing is what unblocks it, but standing up a live card charge on a
// second storefront is that card's build and sign-off, not this one's. Extending
// it is a change to IK's copy of THIS file plus the `lib/actions/order-payment.ts`
// action it would call — which deliberately does not exist on IK today, so there
// is no reachable endpoint to charge against.
// ============================================================================

/** Not on offer, and nothing to say about it. The Payment panel prints wording
 *  only for the refusals a customer needs explained (see `pay-balance.ts`); a
 *  storefront that does not offer the control at all is not one of them. */
const NOT_OFFERED: PayBalanceDecision = {
  allowed: false,
  amount: 0,
  refusal: "card_unavailable",
  message: null,
};

/**
 * The decision AND the control that acts on it, resolved together so a site can
 * never end up offering one without the other.
 */
export async function payBalanceForOrder(
  _order: PayBalanceOrderRow,
  _session: { contactId: number; email: string },
  _opts: { checkoutSettings?: CheckoutSettings } = {}
): Promise<{ decision: PayBalanceDecision; panel: ReactNode }> {
  return { decision: NOT_OFFERED, panel: null };
}
