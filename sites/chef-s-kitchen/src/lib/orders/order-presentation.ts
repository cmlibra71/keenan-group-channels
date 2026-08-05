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

/**
 * Colours for the order-status chip.
 *
 * Deliberately the SAME expression the Order History list uses inline, so the
 * status a customer sees on the list and the status they see one click later are
 * the same word in the same colour. The wording of that chip (today the raw
 * `orders.status` value) is owned by a separate card; when it lands it changes
 * BOTH surfaces at once rather than leaving the list saying "awaiting_fulfillment"
 * and the detail page saying "Being prepared".
 */
export function orderStatusChipClass(status: string | null | undefined): string {
  if (status === "completed") return "text-accent bg-accent-subtle";
  if (status === "shipped") return "bg-accent-subtle text-accent-dark";
  return "bg-surface-secondary text-text-secondary";
}

/** One line of the money breakdown, carried in both bases so the GST toggle can pick. */
export interface OrderTotalRow {
  label: string;
  exTax: number;
  incTax: number;
}

/**
 * The rows above the order total, in order.
 *
 * Subtotal and delivery are always shown; handling only when it was charged. The
 * last row is the reason the column adds up: on real orders the stored total does
 * NOT always equal subtotal + delivery — a store credit was applied, or (on a
 * handful of imported orders) the total was written without the delivery line.
 * Rather than print a column of figures that visibly fails to sum — the fastest
 * way to earn a support call — the residual is stated as its own row, named after
 * its cause where the order records one.
 *
 * Computed independently on each basis, because the ex-tax and inc-tax columns are
 * stored separately and a credit is a single figure applied to both.
 */
export function orderTotalRows(input: {
  subtotalExTax: number;
  subtotalIncTax: number;
  shippingExTax: number;
  shippingIncTax: number;
  handlingExTax: number;
  handlingIncTax: number;
  totalExTax: number;
  totalIncTax: number;
  storeCreditAmount?: number;
  discountAmount?: number;
}): OrderTotalRow[] {
  const rows: OrderTotalRow[] = [
    { label: "Subtotal", exTax: input.subtotalExTax, incTax: input.subtotalIncTax },
    { label: "Delivery", exTax: input.shippingExTax, incTax: input.shippingIncTax },
  ];
  if (input.handlingExTax > 0 || input.handlingIncTax > 0) {
    rows.push({ label: "Handling", exTax: input.handlingExTax, incTax: input.handlingIncTax });
  }

  const residualEx =
    input.totalExTax - (input.subtotalExTax + input.shippingExTax + input.handlingExTax);
  const residualInc =
    input.totalIncTax - (input.subtotalIncTax + input.shippingIncTax + input.handlingIncTax);

  if (Math.abs(residualEx) > 0.005 || Math.abs(residualInc) > 0.005) {
    const label =
      (input.storeCreditAmount ?? 0) > 0
        ? "Store credit applied"
        : (input.discountAmount ?? 0) > 0
          ? "Discount"
          : "Adjustment";
    rows.push({ label, exTax: residualEx, incTax: residualInc });
  }

  return rows;
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

// ── The money. ───────────────────────────────────────────────────────────────
// Completed rows only, refunds separated from payments — byte-for-byte the rule
// PaymentService.recordManualPayment applies when it decides `paid` vs
// `partially_paid`, so the figure shown and the status stored cannot contradict
// each other.

function isCompleted(row: TransactionRowLike): boolean {
  return String(row.status ?? "").trim().toLowerCase() === "completed";
}

function isRefund(row: TransactionRowLike): boolean {
  return String(row.event ?? "").trim().toLowerCase() === "refund";
}

/** Money the customer handed over: completed, non-refund transactions. */
export function creditsFromTransactions(rows: readonly TransactionRowLike[]): number {
  let total = 0;
  for (const row of rows) if (isCompleted(row) && !isRefund(row)) total += num(row.amount);
  return total;
}

/** Money given back through the ledger: completed refund transactions, positive. */
export function refundsFromTransactions(rows: readonly TransactionRowLike[]): number {
  let total = 0;
  for (const row of rows) if (isCompleted(row) && isRefund(row)) total += Math.abs(num(row.amount));
  return total;
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

/** Where the money on an order stands, as the customer should read it. */
export interface PaymentPosition {
  /** Net of refunds — what the customer is actually out of pocket. */
  paid: number;
  /** Money given back. Zero unless the order was refunded in whole or in part. */
  refunded: number;
  /** Still to pay. Zero once the order is settled or fully refunded. */
  owed: number;
  /** Nothing further is owed. */
  settled: boolean;
}

/**
 * The whole payment position in one pure step, so the page renders it rather than
 * deriving it.
 *
 * Three realities have to agree here:
 *
 *   * a Zoey-imported order is stamped `paid` with NO ledger rows at all, so an
 *     empty ledger cannot be read as "nothing has been paid";
 *   * a refund can be recorded EITHER as a ledger row or (for imported orders)
 *     only as `orders.refunded_amount`, so both are consulted and the larger
 *     wins — they are two records of the same money, never two refunds;
 *   * a refund reduces what is due, so a fully refunded order shows $0 paid and
 *     $0 outstanding rather than the full amount in both columns.
 */
export function paymentPosition(input: {
  paymentStatus: string | null | undefined;
  totalIncTax: number;
  refundedAmount?: number | null;
  transactions: readonly TransactionRowLike[];
}): PaymentPosition {
  const { paymentStatus, totalIncTax, transactions } = input;
  const key = (paymentStatus ?? "").trim().toLowerCase();
  const storedRefund = Math.max(0, num(input.refundedAmount));

  const ledgerCredits = creditsFromTransactions(transactions);
  // No completed payment on the ledger but the business calls it paid (or
  // refunded, which implies it was paid first): the order total is what moved.
  const grossPaid =
    ledgerCredits === 0 && (key === "paid" || key === "refunded") ? totalIncTax : ledgerCredits;

  // A 'refunded' order was refunded in full even when nothing recorded how much.
  const refunded = Math.max(
    refundsFromTransactions(transactions),
    storedRefund,
    key === "refunded" ? grossPaid : 0
  );

  const paid = Math.max(grossPaid - refunded, 0);
  const due = Math.max(totalIncTax - refunded, 0);
  const owedRaw = outstanding(due, paid);
  const settled = isSettled(paymentStatus, owedRaw);

  return { paid, refunded, owed: settled ? 0 : owedRaw, settled };
}

/**
 * The payment term to quote on a net-terms order, or `null` when nobody has
 * agreed one.
 *
 * Order of truth: the term stamped on the order at checkout, then the term on the
 * account the order bills to, then the channel's configured default. If none of
 * those exist the answer is `null` and the page says so in words — inventing a
 * number here would tell a customer the business agreed a commercial term it
 * never agreed. (`accounts.net_terms_days` defaults to 0, which means "not set",
 * not "due immediately".)
 */
export function resolveNetTermsDays(
  onOrder: number | null | undefined,
  onAccount: number | null | undefined,
  channelDefault: number | null | undefined
): number | null {
  for (const candidate of [onOrder, onAccount, channelDefault]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.round(candidate);
    }
  }
  return null;
}

/**
 * What the page tells a customer about an order billed to their account.
 *
 * The sentence lives here, not in the markup, because the rule it encodes is
 * commercial: with no agreed term on record it must NOT name one. Kept testable
 * for exactly that reason.
 */
export function netTermsMessage(days: number | null, invoiceNumber?: string | null): string {
  const opening = days
    ? `This order is on your account with Net ${days} payment terms.`
    : "This order is on your account, to be paid on your agreed payment terms.";
  const invoice = invoiceNumber ? ` (${invoiceNumber})` : "";
  return `${opening} An invoice${invoice} will be issued for it — no action is required here.`;
}
