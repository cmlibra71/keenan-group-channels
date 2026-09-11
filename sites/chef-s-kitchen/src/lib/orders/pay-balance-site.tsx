import type { ReactNode } from "react";
import type { CheckoutSettings } from "@keenan/services";
import { resolveStripeGateway } from "@/lib/payments/gateway";
import { PayBalancePanel } from "@/app/account/orders/[id]/pay-balance-panel";
import type { PayBalanceDecision } from "./pay-balance";
import { resolvePayBalance, type PayBalanceOrderRow } from "./pay-balance-context";

// ============================================================================
// THE ONE PER-SITE SEAM in the customer order detail page — Chefs Depot's copy,
// which wires the real thing.
//
// The page, both of its sections and every rule module under `lib/orders/` are
// byte-identical on every storefront (card D045H6Zh). This file is the only place
// a storefront differs, and it answers one question: may this customer settle the
// balance by card here, and what control do we draw if so.
//
// Chefs Depot answers it with card Sh03niVC in full: `resolvePayBalance` gathers
// the facts and asks the pure `decidePayBalance` rule, and the SAME rule is asked
// again inside `startOrderBalancePayment` before any PaymentIntent is created, so
// the button we render and the payment the server will accept cannot drift.
//
// See `template/src/lib/orders/pay-balance-site.tsx` for the default (not
// offered), which is what Industry Kitchens still uses.
// ============================================================================

/**
 * Does THIS storefront take a card payment on an existing ORDER at all? Yes — Chefs Depot wires
 * card Sh03niVC here. Asked by the customer's pro-forma (`lib/quotes/pro-forma-email.ts`, card
 * isl1uwjR) so it only says "Pay your order" where the order page it links to has a Pay control;
 * the default copy (Industry Kitchens) answers false. Kept beside `payBalanceForOrder` so the two
 * answers change together.
 */
export const ORDER_CARD_PAYMENT_OFFERED = true;

/**
 * The decision alone, without building the control — for a page that only needs to know
 * whether to say "pay" about an order it links to (the account quote page, card isl1uwjR). The
 * SAME `resolvePayBalance` the order page and the pay action ask, so the link's verb and the
 * control behind it cannot disagree.
 */
export async function payBalanceDecisionForOrder(
  order: PayBalanceOrderRow,
  session: { contactId: number; email: string },
  opts: { checkoutSettings?: CheckoutSettings } = {}
): Promise<PayBalanceDecision> {
  return resolvePayBalance(order, session, opts);
}

export async function payBalanceForOrder(
  order: PayBalanceOrderRow,
  session: { contactId: number; email: string },
  opts: { checkoutSettings?: CheckoutSettings } = {}
): Promise<{ decision: PayBalanceDecision; panel: ReactNode }> {
  const decision = await payBalanceDecisionForOrder(order, session, opts);
  if (!decision.allowed) return { decision, panel: null };

  // The publishable key for the card form, resolved the same way the checkout
  // page resolves it (test-vs-live aware, prod-safe fallback) and never fatal:
  // with no gateway the panel simply says card payment is not available.
  const stripe = await resolveStripeGateway().catch(() => ({ gateway: null }));

  return {
    decision,
    panel: (
      <PayBalancePanel
        orderId={order.id}
        amount={decision.amount}
        stripePublishableKey={stripe.gateway?.credentials?.publishable_key ?? null}
      />
    ),
  };
}
