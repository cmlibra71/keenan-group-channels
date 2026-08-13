// ============================================================================
// The impure half of the pay-balance decision: gather what `decidePayBalance`
// needs, then ask it.
//
// The ORDER page and the pay-balance server action both call this, so the button
// a customer is offered and the payment the server will accept are decided by
// one function reading one set of facts. Checkout states the same invariant for
// its own gates ("every filter applied on the page is duplicated in placeOrder"),
// and this is that invariant satisfied by construction rather than by discipline.
//
// The payment-method list is read EXACTLY as checkout reads it:
// `customerPaymentMethods` (enabled, minus anything the channel marks staff-only)
// narrowed by the account's own allow-list. So "card is on at checkout" and "card
// is on here" can never disagree, and an account restricted to net terms is not
// quietly offered a card on its order page.
// ============================================================================

import type { CheckoutSettings } from "@keenan/services";
import { getCheckoutSettings } from "@/lib/store";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import { filterPaymentMethodsForAccount } from "@/lib/checkout/account-options-policy";
import { getContactPermissions } from "@/lib/role-permissions";
import { paymentPosition, visibleTransaction, type TransactionRowLike } from "./order-presentation";
import { decidePayBalance, type PayBalanceDecision } from "./pay-balance";

export interface PayBalanceOrderRow {
  id: number;
  status: string | null;
  payment_status: string | null;
  /** `orders.account_id` — set only when the order belongs to a business account. */
  account_id: number | null;
  /**
   * `orders.external_source`. Not a customer-facing field and never rendered: it
   * is read ONLY to keep the Pay button off the 33k Zoey-imported orders, whose
   * payments have not been synced yet (card 1IPO2D53).
   */
  external_source?: string | null;
  total_inc_tax: string | null;
  refunded_amount: string | null;
  transactions?: TransactionRowLike[];
}

function money(value: unknown): number {
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function resolvePayBalance(
  order: PayBalanceOrderRow,
  session: { contactId: number; email: string },
  /**
   * The order page has already loaded the channel's checkout settings (eleven
   * settings reads) to label the payment method, so it hands them in rather than
   * paying for them twice. The FILTERING is still done here either way — that is
   * the part the page and the action must agree on, not who fetched the list.
   */
  opts: { checkoutSettings?: CheckoutSettings } = {}
): Promise<PayBalanceDecision> {
  const { owed, settled } = paymentPosition({
    paymentStatus: order.payment_status,
    totalIncTax: money(order.total_inc_tax),
    refundedAmount: money(order.refunded_amount),
    transactions: (order.transactions ?? []).map(visibleTransaction),
  });

  const [checkoutSettings, accountOptions] = await Promise.all([
    opts.checkoutSettings ? Promise.resolve(opts.checkoutSettings) : getCheckoutSettings(),
    resolveAccountOptions(session),
  ]);
  const methodIds = filterPaymentMethodsForAccount(
    checkoutSettings.customerPaymentMethods,
    accountOptions?.allowedPaymentMethods ?? null
  ).map((m) => m.id);

  // Only a BUSINESS account's order needs a role, so only that case pays for the
  // lookup. A failure resolves to no role, which the pure rule refuses — paying
  // is a money authorisation, and this one gate deliberately fails CLOSED.
  let viewerRoleName: string | null = null;
  if (order.account_id != null) {
    viewerRoleName = await getContactPermissions(session.contactId)
      .then((p) => p.roleName)
      .catch(() => null);
  }

  return decidePayBalance({
    orderStatus: order.status,
    orderExternalSource: order.external_source ?? null,
    orderAccountId: order.account_id,
    owed,
    settled,
    customerPaymentMethodIds: methodIds,
    viewerRoleName,
  });
}
