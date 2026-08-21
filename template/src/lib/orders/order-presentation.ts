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

// ── Method ids, and the fact that most of ours are Zoey's, not ours ──────────
//
// Industry Kitchens' order history is fifteen years of Magento/Zoey plugin ids,
// not the handful our own checkout writes. Of the ~20,500 IK orders a customer
// can actually open (channel 1 with a `contact_id`, read from production
// 2026-08-15):
//
//   cryozonic_stripe 15,319 · banktransfer 3,722 · send_bill 709 ·
//   ewayrapid_ewayone 348 · netterm 247 · free 110 · paypal_standard 22 ·
//   purchaseorder 7 · bank_transfer 3 · stripe 1
//
// Chefs Depot never exposed this — all of its orders came from the new checkout,
// on `stripe` / `bank_transfer` / `net_terms` — which is why a page written and
// verified on CD alone reads perfectly there and badly on IK. Two consequences,
// both customer-visible:
//
//   1. A gateway id must never be printed. "cryozonic stripe" is a plugin's
//      name, not a way to pay, and the brief's standing rule is real terms only.
//      An id we do not recognise reads "Not recorded" — saying nothing is
//      honest, showing plumbing is not.
//   2. The panels that tell a customer HOW to settle an unpaid order key off the
//      method. `paymentMethod === "bank_transfer"` is false on all 3,722 IK bank
//      transfers, which would print a five-figure balance in red with no bank
//      details, no reference and no explanation next to it.
//
// So an id resolves to a FAMILY, and everything downstream asks about the family
// rather than the literal string.

/** The kinds of payment this page has to be able to talk about. */
export type PaymentMethodFamily =
  | "card"
  | "bank_transfer"
  | "net_terms"
  | "paypal"
  | "purchase_order"
  | "free";

/**
 * Every payment-method id that has ever reached an order on either storefront,
 * mapped to what it MEANS. Legacy Zoey ids sit beside the modern ones because
 * they are the same act of paying under a different plugin's name.
 */
const METHOD_FAMILY: Record<string, PaymentMethodFamily> = {
  // Card. `cryozonic_stripe` is Zoey's Stripe plugin; `ewayrapid_ewayone` is eWAY.
  stripe: "card",
  card: "card",
  cryozonic_stripe: "card",
  ewayrapid_ewayone: "card",
  // Bank transfer. Zoey wrote it without the underscore.
  bank_transfer: "bank_transfer",
  banktransfer: "bank_transfer",
  // On account, invoiced. Zoey's "Send Bill" is the same promise as Net Terms:
  // the goods go out and an invoice follows.
  net_terms: "net_terms",
  netterm: "net_terms",
  send_bill: "net_terms",
  send_invoice: "net_terms",
  paypal_standard: "paypal",
  paypal: "paypal",
  purchaseorder: "purchase_order",
  purchase_order: "purchase_order",
  free: "free",
};

/** What each family is called on a customer's screen. */
const FAMILY_LABELS: Record<PaymentMethodFamily, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  net_terms: "Account (invoice)",
  paypal: "PayPal",
  purchase_order: "Purchase order",
  free: "No payment required",
};

/** Ids that are a wording of their own rather than a way of paying. */
const FALLBACK_METHOD_LABELS: Record<string, string> = {
  manual: "Recorded by our team",
};

function methodId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** What kind of payment this id is, or `null` when we have never seen it. */
export function paymentMethodFamily(
  id: string | null | undefined
): PaymentMethodFamily | null {
  return METHOD_FAMILY[methodId(id)] ?? null;
}

/** Paid by card — modern Stripe, Zoey's Stripe plugin or the old eWAY one. */
export function isCardMethod(id: string | null | undefined): boolean {
  return paymentMethodFamily(id) === "card";
}

/** Settled by bank transfer, under either spelling. */
export function isBankTransferMethod(id: string | null | undefined): boolean {
  return paymentMethodFamily(id) === "bank_transfer";
}

/** On account and invoiced — Net Terms, Zoey's `netterm`, or Zoey's Send Bill. */
export function isNetTermsMethod(id: string | null | undefined): boolean {
  return paymentMethodFamily(id) === "net_terms";
}

/**
 * The channel's configuration for this order's method, matched by id and then by
 * FAMILY.
 *
 * The family step is what lets a legacy `banktransfer` order show the bank
 * details and reference configured against `bank_transfer` today. It is used for
 * the PANELS (bank details, the channel's default net-terms days) and never for
 * the label — see `paymentMethodLabel`, which stays on an exact match so a
 * Zoey "Send Bill" order is not relabelled with the name of a Net Terms method
 * the customer may never have been given.
 */
export function resolvePaymentMethodConfig<T extends PaymentMethodLike>(
  id: string | null | undefined,
  methods: readonly T[] = []
): T | undefined {
  const key = methodId(id);
  if (!key) return undefined;
  const exact = methods.find((m) => methodId(m.id) === key);
  if (exact) return exact;
  const family = METHOD_FAMILY[key];
  if (!family) return undefined;
  return methods.find((m) => METHOD_FAMILY[methodId(m.id)] === family);
}

/**
 * What the customer calls the way they paid.
 *
 * The channel's own configured name wins on an EXACT id match — that is the
 * wording the checkout and the confirmation email already used, and
 * `getCheckoutSettings().paymentMethods` deliberately keeps disabled methods so a
 * historical order still resolves. Otherwise the family's own plain word.
 *
 * An id in none of those tables answers "Not recorded". It deliberately does NOT
 * fall through to the id with its underscores swapped for spaces: that is how
 * "cryozonic stripe" and "ewayrapid ewayone" would have reached ~15,700 IK
 * customers' screens.
 */
export function paymentMethodLabel(
  methodId: string | null | undefined,
  methods: readonly PaymentMethodLike[] = []
): string {
  const id = (methodId ?? "").trim().toLowerCase();
  if (!id) return "Not recorded";
  const configured = methods.find((m) => (m.id ?? "").trim().toLowerCase() === id)?.name?.trim();
  if (configured) return configured;
  const explicit = FALLBACK_METHOD_LABELS[id];
  if (explicit) return explicit;
  const family = METHOD_FAMILY[id];
  return family ? FAMILY_LABELS[family] : "Not recorded";
}

/**
 * Which "here is how you settle this" block the page owes the customer.
 *
 * One decision, because leaving it as three independent conditions in the markup
 * is what allowed an unpaid order to render a red balance and nothing else. The
 * rule: an account order states its invoice terms; anything still owing must
 * carry SOMETHING telling the customer what to do about it, and when we have no
 * specific instructions for the method that something is "contact us".
 *
 * A CANCELLED or refunded order is silent, whatever its figures say. Those orders
 * routinely keep a full outstanding balance on the row — Industry Kitchens has
 * cancelled orders carrying six and seven figures — and asking a customer to
 * settle one, or telling them an invoice is on its way, would be asking for money
 * that is not owed. That is `orderPayable`, and the page derives it with
 * `isUnpayableOrderStatus` — the SAME list the Pay-by-card button refuses on, so
 * the button and the wording beside it cannot disagree about what a cancelled
 * order is. A BOOLEAN rather than the status itself, so that `orders.status`
 * (which carries finance-company names like `silverchef`) never crosses into a
 * component boundary: a dev build serialises those props into the page.
 *
 * `explainedElsewhere` is the pay-by-card control or its refusal sentence — where
 * one of those renders, the customer already has an answer.
 */
export type OutstandingGuidance = "bank_transfer" | "net_terms" | "contact_us" | null;

export function outstandingGuidance(input: {
  methodId: string | null | undefined;
  /** False on a cancelled, declined or refunded order. */
  orderPayable: boolean;
  owed: number;
  explainedElsewhere: boolean;
}): OutstandingGuidance {
  if (!input.orderPayable) return null;
  if (isNetTermsMethod(input.methodId)) return "net_terms";
  if (!(input.owed > 0)) return null;
  if (isBankTransferMethod(input.methodId)) return "bank_transfer";
  if (input.explainedElsewhere) return null;
  return "contact_us";
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
  // Zoey's own two, carried by 1,078 Industry Kitchens orders (prod 2026-08-15).
  unpaid: "Awaiting payment",
  refund_in_progress: "Refund in progress",
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
 * the same word in the same colour.
 *
 * The WORDING of that chip is not decided here — it comes from
 * `customerOrderStage()` in ./order-status-label.ts, which both the list and the
 * detail page call. That pairing is the whole point: the raw `orders.status`
 * column is a staff column carrying finance-company names and internal shorthand,
 * so neither surface may ever render it, and neither may render a different word
 * from the other. Change the wording there and both surfaces change together.
 */
export function orderStatusChipClass(status: string | null | undefined): string {
  if (status === "completed") return "text-accent bg-accent-subtle";
  if (status === "shipped") return "bg-accent-subtle text-accent-dark";
  return "bg-surface-secondary text-text-secondary";
}

// ── The money the customer reads, GST-INCLUSIVE ──────────────────────────────
//
// Every figure on the order page is GST-inclusive, whatever the storewide
// "Excluding GST" toggle is set to (card Roy0kIEz). The toggle belongs to product
// pages and nowhere else (Steve, 2026-08-05, card 33HGX8U2), and the standing
// rule is that customer-facing money — quotes, orders, refunds — is GST-inclusive.
// This page used to follow the toggle while the Order History list it is opened
// from always printed `total_inc_tax`, so one order read $1,100.00 on the list and
// "Order Total (ex GST) $1,000.00" one click later.
//
// An order stores every figure twice, `*_ex_tax` and `*_inc_tax`, and on real data
// those columns cannot be taken at face value (production 2026-08-15, all 33,908
// orders on both storefronts):
//
//   * Chefs Depot — 74 orders, all written by our own checkout: every column
//     correct, inc = ex x 1.1 on the order, on delivery and on every line.
//   * Industry Kitchens — 33,834 orders, fifteen years of Zoey. On the 30,690 that
//     carry a subtotal, that subtotal and the delivery are right, but the ORDER
//     TOTAL holds the INCLUSIVE figure in both columns and every LINE holds the
//     EXCLUSIVE figure in both (39,042 of the 39,145 lines a customer can open).
//   * Industry Kitchens, 3,144 orders — the import wrote the grand total and
//     NOTHING else: `subtotal_ex_tax`, `subtotal_inc_tax`, the delivery columns and
//     `total_tax` are all 0 while `total_inc_tax` and the lines are real. 728 of
//     them carry a `contact_id`, so a signed-in customer can open them today, and
//     they are the RECENT ones — 64 of the last 500 IK orders, 244 of July's 1,230.
//
// So a page that simply printed `*_inc_tax` would show an Industry Kitchens
// customer $87.00 lines under a $95.70 subtotal, and a page that read its GST rate
// off the subtotal columns alone would show that third group ex-GST lines under a
// $0.00 subtotal with the whole order restated as an "Adjustment". Two rules,
// applied in that order, cover every figure:
//
//   1. THE RATE. An order's GST rate on goods is its own `subtotal_inc /
//      subtotal_ex` wherever that pair says anything. Where it says nothing (the
//      3,144), the rate is the one the ORDER TOTAL implies: the figures that
//      already record their own GST are taken as they are, everything else is
//      grossed by the single factor that makes the column reach the stored total —
//      capped at 1.1, because 10% is the whole of Australian GST and a factor above
//      it would be claiming tax that cannot legally have been charged, and floored
//      at 1, because a total BELOW the lines is no evidence of tax at all.
//   2. THE AMOUNT. The inclusive amount of a stored figure is that figure's
//      inclusive column where it really is inclusive, else its exclusive column at
//      the rate from step 1.
//
// Reading the rate off the order rather than hard-coding 1.1 is what keeps a
// GST-free order honest (order 1806 carries $300 of GST-free goods and $25 of
// freight: its subtotal columns are equal, so its goods are quoted unchanged and
// only the freight carries tax). Scaling the lines and the subtotal by the SAME
// factor — see `orderLineBasis`, which both share — is what makes the lines sum to
// the subtotal exactly rather than approximately.
//
// The rate is a blended one where an order mixes taxed and GST-free goods (17 IK
// orders, e.g. PFIK_20248880 at 186.46/172.24 = 1.0826). Every line is then scaled
// by that blend, so a GST-free line reads slightly high and a taxed line slightly
// low while the column still sums. It is an inference on money and it is stated
// here because it is the least-bad option available: the per-line tax was never
// imported, so the alternative is a breakdown that does not add up.
//
// The ORDER TOTAL is never derived. It is the stored `total_inc_tax`, the same
// column the Order History list prints, because those two screens agreeing is the
// whole point of the card. Anything the components fail to reach is stated in the
// reconciling row — and where the components cannot be reconciled to it at all,
// `orderTotalRows` prints NO breakdown rather than a false one.

/** Australian GST, as a multiplier. The only rate an order's goods can carry. */
const GST_RATE_FACTOR = 1.1;

/** One line's two stored money columns. */
export interface OrderLineAmount {
  exTax: number;
  incTax: number;
}

/**
 * The order's lines split by whether they recorded their own GST.
 *
 * `fixedIncTax` is the money that already knows what it is worth inclusive;
 * `scalableExTax` is the money stored without its tax, which has to be grossed at
 * the order's rate. Every consumer of the split — the rate, the subtotal, and the
 * per-line figure the page prints — uses the SAME partition, which is why the
 * lines sum to the subtotal exactly.
 */
export interface OrderLineBasis {
  fixedIncTax: number;
  scalableExTax: number;
}

/** Split the order's lines into what already records its GST and what does not. */
export function orderLineBasis(lines: readonly OrderLineAmount[]): OrderLineBasis {
  let fixedIncTax = 0;
  let scalableExTax = 0;
  for (const line of lines) {
    const ex = num(line.exTax);
    const inc = num(line.incTax);
    if (inc > ex + 0.005) fixedIncTax += inc;
    else scalableExTax += ex;
  }
  return { fixedIncTax, scalableExTax };
}

/** The inclusive subtotal of the lines, at this order's rate. */
export function lineSubtotalIncTax(basis: OrderLineBasis, taxFactor: number): number {
  const factor = Number.isFinite(taxFactor) && taxFactor > 1 ? taxFactor : 1;
  return num(basis.fixedIncTax) + num(basis.scalableExTax) * factor;
}

/** The order columns and lines every money rule here reads. */
export interface OrderMoneyInput {
  subtotalExTax: number;
  subtotalIncTax: number;
  shippingExTax?: number;
  shippingIncTax?: number;
  handlingExTax?: number;
  handlingIncTax?: number;
  totalIncTax?: number;
  /** The lines the page lists (cancelled ones already dropped). */
  lines?: OrderLineBasis;
}

/** Is the stored subtotal pair worth anything? 3,144 IK orders store 0 in both. */
function storedSubtotalUsable(input: { subtotalExTax: number }): boolean {
  return Number.isFinite(input.subtotalExTax) && input.subtotalExTax > 0;
}

/**
 * This order's own GST rate on goods, as a multiplier.
 *
 * The subtotal columns answer it wherever they say anything at all, so an order
 * that carried no GST (or a rate that is not 10%) is quoted at what it actually
 * charged. Where they say nothing — 3,144 Industry Kitchens orders store 0 in both,
 * with a real total and real lines — the rate is the one the stored TOTAL implies,
 * clamped to the range a real Australian order can occupy:
 *
 *   * above 1.1 the answer is 1.1. Ten per cent is the whole of GST, so a larger
 *     gap between the lines and the total is freight or a fee the import dropped,
 *     not tax, and it belongs in the reconciling row rather than inside the goods.
 *   * at or below 1 the answer is 1. A total no bigger than the lines is no
 *     evidence of tax, and inventing some would overstate what was charged.
 *
 * Answering 1 is always the safe direction: it can never invent tax that was never
 * charged. It is not always the HONEST one, which is why the total is consulted
 * before falling back to it.
 */
export function orderTaxFactor(input: OrderMoneyInput): number {
  const ex = input.subtotalExTax;
  const inc = input.subtotalIncTax;
  if (storedSubtotalUsable(input)) {
    return Number.isFinite(inc) && inc > ex ? inc / ex : 1;
  }

  // The subtotal columns say nothing. Ask the order total instead.
  const total = num(input.totalIncTax);
  const basis = input.lines;
  if (!basis || !(total > 0)) return 1;

  let fixed = num(basis.fixedIncTax);
  let scalable = num(basis.scalableExTax);
  for (const part of [
    { ex: num(input.shippingExTax), inc: num(input.shippingIncTax) },
    { ex: num(input.handlingExTax), inc: num(input.handlingIncTax) },
  ]) {
    if (part.inc > part.ex + 0.005) fixed += part.inc;
    else scalable += part.ex;
  }
  if (!(scalable > 0)) return 1;

  const implied = (total - fixed) / scalable;
  if (!Number.isFinite(implied) || implied <= 1) return 1;
  return Math.min(implied, GST_RATE_FACTOR);
}

/**
 * The GST-inclusive amount of one stored figure.
 *
 * A figure whose inclusive column is genuinely higher than its exclusive one has
 * recorded its own GST and is taken as stored. A figure that stores the same
 * amount twice — every Zoey-imported line — never recorded it, so it is quoted at
 * the order's own rate.
 */
export function gstInclusiveAmount(input: {
  exTax: number;
  incTax: number;
  taxFactor: number;
}): number {
  const { exTax, incTax } = input;
  if (incTax > exTax + 0.005) return incTax;
  const factor = Number.isFinite(input.taxFactor) && input.taxFactor > 1 ? input.taxFactor : 1;
  return exTax * factor;
}

/** One line of the money breakdown. GST-inclusive — there is no other basis here. */
export interface OrderTotalRow {
  label: string;
  amount: number;
}

/**
 * The rows above the order total, in order, every one GST-inclusive.
 *
 * Subtotal and delivery are always shown; handling only when it was charged, which
 * no production order yet is — the handling branch is unit-tested, never observed.
 * The last row is the reason the column adds up: on real orders the stored total
 * does NOT always equal subtotal + delivery — a store credit was applied, or (on a
 * handful of imported orders) the total was written without the delivery line.
 * Rather than print a column of figures that visibly fails to sum — the fastest
 * way to earn a support call — the residual is stated as its own row, named after
 * its cause where the order records one.
 *
 * Where the order STORED its subtotal, that residual reconciles two stored facts
 * and may be large: 298 orders were amended without their subtotal being recomputed
 * (PF20225011-5 reads -$22,089.70 against a $26,407.51 total). That is a data
 * problem this page reports rather than one it creates, and it predates this
 * module; it is left visible rather than smoothed away.
 *
 * The subtotal is the stored one wherever the order stored one. Where it did not
 * (3,144 Industry Kitchens orders store 0 in both columns) it is the sum of the
 * lines the page is printing, at this order's rate — the same partition and the
 * same factor the per-line figures use, so the column sums to it exactly. Never
 * $0.00: a $0.00 subtotal above priced lines, with the whole order restated
 * underneath as an "Adjustment", is the breakdown reading as broken.
 *
 * NO ROWS AT ALL is a legitimate answer, and the only honest one where the order
 * stored no subtotal and the lines cannot be reconciled to its total. 171 orders
 * land here (production, re-measured 2026-08-17 by running this predicate over all
 * 33,908): 99 list lines that are ALL priced at zero, so there is no subtotal to
 * build, and 72 list lines worth MORE than the total they were charged. Delivery
 * tips none of them over on its own. 68 of the 171 are reachable from a signed-in
 * customer's Order History. Printing the Order Total on its own
 * — the figure the customer was charged and the figure the Order History list
 * shows — says less than we would like, but everything it says is true.
 */
export function orderTotalRows(
  input: OrderMoneyInput & {
    shippingExTax: number;
    shippingIncTax: number;
    handlingExTax: number;
    handlingIncTax: number;
    totalIncTax: number;
    storeCreditAmount?: number;
    discountAmount?: number;
  }
): OrderTotalRow[] {
  const taxFactor = orderTaxFactor(input);
  const subtotal = storedSubtotalUsable(input)
    ? gstInclusiveAmount({
        exTax: input.subtotalExTax,
        incTax: input.subtotalIncTax,
        taxFactor,
      })
    : lineSubtotalIncTax(input.lines ?? { fixedIncTax: 0, scalableExTax: 0 }, taxFactor);
  const shipping = gstInclusiveAmount({
    exTax: input.shippingExTax,
    incTax: input.shippingIncTax,
    taxFactor,
  });
  const handling = gstInclusiveAmount({
    exTax: input.handlingExTax,
    incTax: input.handlingIncTax,
    taxFactor,
  });

  const residual = input.totalIncTax - (subtotal + shipping + handling);

  // Reconstructed from the lines because the order stored no subtotal — and the
  // reconstruction does not describe this order. Say nothing rather than print a
  // $0.00 subtotal, or a reconciling row the size of the order itself.
  if (!storedSubtotalUsable(input) && (!(subtotal > 0) || residual < -0.005)) {
    return [];
  }

  const rows: OrderTotalRow[] = [
    { label: "Subtotal", amount: subtotal },
    { label: "Delivery", amount: shipping },
  ];
  if (handling > 0) rows.push({ label: "Handling", amount: handling });

  if (Math.abs(residual) > 0.005) {
    const label =
      (input.storeCreditAmount ?? 0) > 0
        ? "Store credit applied"
        : (input.discountAmount ?? 0) > 0
          ? "Discount"
          : "Adjustment";
    rows.push({ label, amount: residual });
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
