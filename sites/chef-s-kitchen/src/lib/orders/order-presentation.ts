// ============================================================================
// Turning an order row into customer language, and working out where the money
// stands. Pure functions only — the order detail page stays a dumb renderer and
// every rule here is unit-tested.
//
// Two things this module is responsible for beyond formatting:
//
//   1. The paid/outstanding figures must agree with the order's own
//      `payment_status`. They are derived with the SAME arithmetic
//      PaymentService.recordManualPayment uses to set that column (completed
//      transactions, refunds negated, sub-cent tolerance), so the page can never
//      tell a customer they owe money on an order the business considers paid.
//
//   2. A transaction row carries gateway internals — the Stripe payment-intent
//      id, the raw gateway response, fraud/AVS/CVV results. `visibleTransaction`
//      is the ONLY way a transaction leaves this module, and it projects the four
//      fields a customer needs. Nothing else may be rendered or handed to a
//      client component (an RSC prop ships in the flight payload even unrendered).
// ============================================================================

/** The shape of a configured channel payment method (subset of PaymentMethodConfig). */
export interface PaymentMethodLike {
  id: string;
  name?: string;
}

/** Fallbacks for methods the channel has never configured, or historical ids. */
const FALLBACK_METHOD_LABELS: Record<string, string> = {
  stripe: "Card",
  card: "Card",
  bank_transfer: "Bank transfer",
  net_terms: "Account (invoice)",
  manual: "Recorded by our team",
};

/**
 * What the customer calls the way they paid.
 *
 * The channel's own configured name wins — that is the wording the checkout and
 * the confirmation email already used, and `getCheckoutSettings().paymentMethods`
 * deliberately keeps disabled methods so a historical order still resolves.
 */
export function paymentMethodLabel(
  methodId: string | null | undefined,
  methods: readonly PaymentMethodLike[] = []
): string {
  const id = (methodId ?? "").trim();
  if (!id) return "Not recorded";
  const configured = methods.find((m) => m.id === id)?.name?.trim();
  if (configured) return configured;
  return FALLBACK_METHOD_LABELS[id] ?? id.replace(/_/g, " ");
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partially_paid: "Part paid",
  pending_payment: "Awaiting payment",
  awaiting_payment: "Awaiting card payment",
  net_terms: "On account",
  failed: "Payment failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  pending: "Awaiting payment",
};

/** Customer-facing wording for `orders.payment_status`. Blank reads as awaiting payment. */
export function paymentStatusLabel(status: string | null | undefined): string {
  const key = (status ?? "").trim().toLowerCase();
  if (!key) return "Awaiting payment";
  return PAYMENT_STATUS_LABELS[key] ?? key.replace(/_/g, " ");
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Received",
  processing: "Being prepared",
  awaiting_fulfillment: "Being prepared",
  shipped: "Dispatched",
  partially_shipped: "Partly dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  refund_in_progress: "Refund in progress",
  refunded: "Refunded",
};

/**
 * Customer-facing wording for `orders.status`.
 *
 * Deliberately a NEW helper used only by the order detail page: the wording and
 * colours of the chip on the Order History list are owned by a separate card and
 * are left exactly as they are. When that card lands, this is where the two
 * surfaces converge.
 */
export function orderStatusLabel(status: string | null | undefined): string {
  const key = (status ?? "").trim().toLowerCase();
  if (!key) return "Received";
  return ORDER_STATUS_LABELS[key] ?? key.replace(/_/g, " ");
}

/** A transaction as it may be shown to the customer. NOTHING else escapes this module. */
export interface VisibleTransaction {
  id: number;
  created_at: string | Date | null;
  amount: number;
  event: string;
  status: string;
}

/**
 * The parts of a transaction row this module is willing to look at.
 *
 * Structural, not exhaustive: a real row carries far more (gateway ids, gateway
 * response, fraud/AVS/CVV), and the point of naming only these five is that no
 * function here can read the rest even by accident.
 */
export interface TransactionRowLike {
  id?: unknown;
  created_at?: unknown;
  amount?: unknown;
  event?: unknown;
  status?: unknown;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Project a transaction down to what a customer may see: when, how much, what it
 * was, whether it worked.
 *
 * Everything else on the row is gateway internals (`gateway_transaction_id`,
 * `gateway_response`, `fraud_review`, `avs_result`, `cvv_result`, `gateway`,
 * `custom_provider_field`) and must not reach the browser. This is a whitelist,
 * not a blacklist, so a new column on the table cannot leak by default.
 */
export function visibleTransaction(row: TransactionRowLike): VisibleTransaction {
  const created = row.created_at;
  return {
    id: Number(row.id ?? 0),
    created_at:
      created instanceof Date || typeof created === "string" ? created : null,
    amount: num(row.amount),
    event: String(row.event ?? ""),
    status: String(row.status ?? ""),
  };
}

/** Wording for a single ledger line ("Payment", "Refund", "Payment failed", …). */
export function transactionOutcomeLabel(tx: {
  event: string;
  status: string;
}): string {
  const status = tx.status.trim().toLowerCase();
  const event = tx.event.trim().toLowerCase();
  const noun = event === "refund" ? "Refund" : event === "authorization" ? "Authorisation" : "Payment";
  if (status === "completed" || status === "success" || status === "succeeded") return `${noun} received`;
  if (status === "failed" || status === "declined") return `${noun} failed`;
  if (status === "pending") return `${noun} pending`;
  if (!status) return noun;
  return `${noun} — ${status.replace(/_/g, " ")}`;
}

/**
 * Money actually received against the order: completed transactions summed with
 * refunds negated.
 *
 * Byte-for-byte the rule PaymentService.recordManualPayment applies when it
 * decides `paid` vs `partially_paid`, so the number shown and the status stored
 * can never contradict each other.
 */
export function paidFromTransactions(rows: readonly TransactionRowLike[]): number {
  let paid = 0;
  for (const row of rows) {
    if (String(row.status ?? "").trim().toLowerCase() !== "completed") continue;
    const sign = String(row.event ?? "").trim().toLowerCase() === "refund" ? -1 : 1;
    paid += sign * num(row.amount);
  }
  return paid;
}

/** What is still owed, never negative, with the service's sub-cent tolerance. */
export function outstanding(totalIncTax: number, paid: number): number {
  const owed = totalIncTax - paid;
  return owed <= 0.005 ? 0 : owed;
}

/**
 * Does the ledger say this order is settled?
 *
 * The ledger alone is not enough: orders imported from Zoey routinely carry
 * `payment_status = 'paid'` with no transaction rows at all. The stored status is
 * therefore authoritative for "paid"/"refunded", and the ledger only decides the
 * cases the status leaves open.
 */
export function isSettled(paymentStatus: string | null | undefined, owed: number): boolean {
  const key = (paymentStatus ?? "").trim().toLowerCase();
  if (key === "paid" || key === "refunded") return true;
  if (key === "net_terms") return false;
  return owed === 0;
}
