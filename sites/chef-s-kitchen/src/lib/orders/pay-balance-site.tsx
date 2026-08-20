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

export async function payBalanceForOrder(
  order: PayBalanceOrderRow,
  session: { contactId: number; email: string },
  opts: { checkoutSettings?: CheckoutSettings } = {}
): Promise<{ decision: PayBalanceDecision; panel: ReactNode }> {
  const decision = await resolvePayBalance(order, session, opts);
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
