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
import { getContactPermissions, getContactRoleOnAccount } from "@/lib/role-permissions";
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

  // WHO IS PAYING, not what the order row says. `orders.account_id` is written
  // only when checkout finds a net-terms entitlement, so a business account's
  // card and bank-transfer orders leave it NULL and asking the column "is an
  // account involved?" answers no on most of them. The viewer's own membership
  // is the fact Tim's rule turns on, so it is always looked up.
  const perms = await getContactPermissions(session.contactId).catch(() => null);

  // `getContactPermissions` FAILS OPEN by design (a resolver hiccup must never
  // brick checkout), which here would read as "not a business contact" and wave
  // the payment through. This gate spends somebody else's money, so an unknown
  // answer is refused instead — the one place that inverts the storefront's
  // fail-open policy, and the pure rule says so in the refusal it returns.
  let viewerRoleUnknown = perms === null || perms.failedOpen;
  let viewerIsAccountMember = perms?.isB2B === true;
  let viewerRoleName: string | null = perms?.roleName ?? null;

  // When the order names an account that is NOT the viewer's primary one, the
  // role above belongs to a different company. 488 live contacts hold more than
  // one membership, so ask about the account that is actually paying.
  if (!viewerRoleUnknown && order.account_id != null && order.account_id !== (perms?.accountId ?? null)) {
    const onOrderAccount = await getContactRoleOnAccount(session.contactId, order.account_id);
    viewerRoleUnknown = onOrderAccount.failed;
    viewerIsAccountMember = true;
    viewerRoleName = onOrderAccount.roleName;
  }

  return decidePayBalance({
    orderStatus: order.status,
    orderExternalSource: order.external_source ?? null,
    orderAccountId: order.account_id,
    owed,
    settled,
    customerPaymentMethodIds: methodIds,
    viewerIsAccountMember,
    viewerRoleName,
    viewerRoleUnknown,
  });
}
