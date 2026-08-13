// ============================================================================
// May this person pay off this order by card, right now — and for how much?
//
// Card Sh03niVC. Until now the only way to pay by card was inside checkout: an
// order that ended up unpaid (bank transfer never sent, a declined card, a
// deposit) could only be settled by transferring money or ringing us. This is the
// one place that decides whether the Pay button appears, restated as a pure
// function so the PAGE (what we show) and the server action (what we accept)
// cannot drift — the same "show equals accept" invariant checkout's payment gates
// state, and the reason a stale page cannot be used to push a payment through a
// closed door.
//
// Tim, 2026-08-10 (on the card), answering point by point:
//   * "It should only appear when the card payment is enabled on the site"
//   * "All orders with money still owing"
//   * no partial payments — the amount is the whole balance, and the customer
//     never types it
//   * "The only people that can should have the role of Manager or Billing on
//     the account"
//
// Chris settled the rest 2026-08-11: an individual or guest shopper — most of
// Chefs Depot — has no business account and can always pay their OWN order (the
// Manager/Billing gate governs who WITHIN a business account may spend the
// company's money); and an order imported from Zoey stays button-less until its
// payment history syncs (card 1IPO2D53), because its "unpaid" is missing data,
// not real debt, and offering to charge a card for it would take money twice.
//
// Pure: no I/O, no React. The caller does the lookups and hands in the answers.
// ============================================================================

/** Why the Pay button is not on offer. `null` when it is. */
export type PayBalanceRefusal =
  /** Card payment is not switched on for this storefront (or not for this account). */
  | "card_unavailable"
  /** Nothing is owing — settled, or refunded back to nil. */
  | "nothing_owing"
  /** Cancelled or refunded: not an order we would take more money for. */
  | "not_payable"
  /** Imported from Zoey; its payments have not come across yet (card 1IPO2D53). */
  | "history_pending"
  /** A business account's order, and this contact is not Manager or Billing. */
  | "not_authorised";

export interface PayBalanceDecision {
  allowed: boolean;
  /** The whole outstanding balance, inc GST. The customer never chooses it. */
  amount: number;
  refusal: PayBalanceRefusal | null;
  /**
   * A sentence to print where the button would have been, or null to say nothing
   * at all. Only ONE refusal earns wording: a colleague who can see the balance
   * but may not pay it needs telling why, or they meet a screen that shows a debt
   * and offers no way to clear it. Every other refusal has its own explanation
   * already on the page (bank details, "paid", "cancelled") or is a state the
   * customer should never be made to reason about.
   */
  message: string | null;
}

/** The two account roles Tim named. Matched by name, case- and space-insensitive. */
const PAYING_ROLE_NAMES: ReadonlySet<string> = new Set(["manager", "billing"]);

/** Order statuses we will not take further money for. */
const UNPAYABLE_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "cancelled",
  "declined",
  "refunded",
  "refund_in_progress",
]);

export interface PayBalanceInput {
  /** `orders.status` — the staff column, never rendered; only reasoned about. */
  orderStatus: string | null | undefined;
  /** `orders.external_source`; "zoey" on the 33k imported orders. */
  orderExternalSource: string | null | undefined;
  /** `orders.account_id` — set when the order belongs to a BUSINESS account. */
  orderAccountId: number | null | undefined;
  /** Outstanding balance inc GST, from `paymentPosition`. */
  owed: number;
  /** `paymentPosition().settled` — the stored status is authoritative for "paid". */
  settled: boolean;
  /**
   * Ids of the payment methods this CUSTOMER may be charged on: the channel's
   * enabled, non-staff-only methods narrowed by the account's own allow-list.
   * Exactly the list checkout offers, so "card is on at checkout" and "card is on
   * here" can never give different answers.
   */
  customerPaymentMethodIds: readonly string[];
  /** The viewer's account role name (`account_roles.name`), null for a B2C shopper. */
  viewerRoleName: string | null | undefined;
}

/** Is `stripe` among the methods this customer may be charged on? */
export function cardPaymentAvailable(methodIds: readonly string[]): boolean {
  return methodIds.some((id) => (id ?? "").trim().toLowerCase() === "stripe");
}

/** Does this role name let its holder spend the company's money? */
export function roleMayPayAccountOrders(roleName: string | null | undefined): boolean {
  return PAYING_ROLE_NAMES.has((roleName ?? "").trim().toLowerCase());
}

function refuse(refusal: PayBalanceRefusal, amount: number, message: string | null = null): PayBalanceDecision {
  return { allowed: false, amount, refusal, message };
}

/**
 * The whole decision, in the order that puts the cheapest and least surprising
 * refusals first. Money state beats permission state deliberately: telling a
 * Buyer they lack the role to pay an order that is already paid would be noise.
 */
export function decidePayBalance(input: PayBalanceInput): PayBalanceDecision {
  // 2dp: the balance is money, and a floating-point tail must never reach Stripe.
  const amount = Math.round(Math.max(0, Number.isFinite(input.owed) ? input.owed : 0) * 100) / 100;

  // Under a cent is not a debt. Zoey's imports leave sub-cent residue (the same
  // rule the Net Terms list applies), and a $0.00 charge is refused by Stripe.
  if (input.settled || amount < 0.01) return refuse("nothing_owing", amount);

  const status = (input.orderStatus ?? "").trim().toLowerCase();
  if (UNPAYABLE_STATUSES.has(status)) return refuse("not_payable", amount);

  // A Zoey order's ledger is empty by construction, so its "outstanding" figure
  // is the whole order total whatever the customer already paid Zoey.
  if ((input.orderExternalSource ?? "").trim().toLowerCase() === "zoey") {
    return refuse("history_pending", amount);
  }

  if (!cardPaymentAvailable(input.customerPaymentMethodIds)) {
    return refuse("card_unavailable", amount);
  }

  // A business account's order: Tim's rule. An order with no account is an
  // individual's or a guest's own order and needs no role at all.
  if (input.orderAccountId != null && !roleMayPayAccountOrders(input.viewerRoleName)) {
    return refuse(
      "not_authorised",
      amount,
      "Only a Manager or Billing contact on your account can pay this order by card. Anyone on the account can still pay by bank transfer."
    );
  }

  return { allowed: true, amount, refusal: null, message: null };
}
