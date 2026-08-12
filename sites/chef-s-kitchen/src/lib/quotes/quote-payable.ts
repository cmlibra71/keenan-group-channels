/**
 * When a customer may pay their quote online, and what to tell them when they
 * cannot yet — card 0Wy0xHuq.
 *
 * The Pay control is NEVER simply hidden while a quote is nearly-payable: it
 * stays on screen, greyed, carrying the reason (same treatment as the Accept
 * button, and the portal's GatedButton pattern). A control that vanishes leaves
 * the customer hunting for it and phoning the sales desk.
 *
 * "The Pay button shows but is greyed, with the reason, while any line is still
 * unpriced. A customer must never pay a quote with unpriced lines." — card
 * description. That is a LINE-level test, deliberately unlike acceptance, which
 * is gated on the quote as a whole: accepting an unpriced quote is a
 * conversation, paying one is a wrong amount of money.
 *
 * $0.00 IS a price. Roughly a third of zero-priced lines are ordinary products
 * someone deliberately zeroed and the rest are note-style entries; neither is
 * "unpriced". Only a missing / unparsable number counts.
 *
 * Pure — the page renders from it and the payQuote action re-checks against it,
 * so what we show is exactly what we accept.
 */

export type QuotePayState =
  /** No Pay control at all — this quote is settled, dead, or already an order. */
  | { kind: "hidden" }
  /** Live, clickable Pay. */
  | { kind: "enabled" }
  /** Visible but greyed out, with this reason. */
  | { kind: "disabled"; reason: string };

export const PAY_REASON_UNPRICED_LINES =
  "Some items on this quote aren't priced yet — your sales rep is finishing it off.";
export const PAY_REASON_PRICING_PENDING = "Pricing is still being prepared";
export const PAY_REASON_NOT_READY = "This quote isn't ready to pay yet";
export const PAY_REASON_NO_TOTAL = "This quote has no amount to pay yet";
export const PAY_REASON_NO_METHODS =
  "Online payment isn't switched on for this store — please contact us to pay this quote.";
export const PAY_REASON_NO_ADDRESS =
  "We need a delivery address before this quote can be paid — please contact us.";

/**
 * Quote states where paying is over: already an order, cancelled, or expired.
 *
 * `quote_accepted` is deliberately NOT here. Accepting without paying sends the
 * customer a pro-forma (Steve, card 0Wy0xHuq) — the money is still owed, and the
 * pro-forma's whole purpose is to be paid.
 */
const TERMINAL_PAY_STATUSES: ReadonlySet<string> = new Set([
  "converted_to_order",
  "quote_cancelled",
  "quote_expired",
]);

/** States from which a customer may pay: a sent, priced quote, or one they accepted. */
const PAYABLE_STATUSES: ReadonlySet<string> = new Set(["quote_available", "quote_accepted"]);

export interface QuotePayLine {
  list_price?: string | number | null;
  sale_price?: string | number | null;
}

/** Is every line on this quote priced? An empty quote is not payable. */
export function everyLinePriced(items: ReadonlyArray<QuotePayLine> | null | undefined): boolean {
  const lines = items ?? [];
  if (lines.length === 0) return false;
  return lines.every((i) => {
    const raw = i?.sale_price ?? i?.list_price;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    return Number.isFinite(n);
  });
}

export interface QuotePayInput {
  status?: string | null;
  /** Already-resolved price visibility — only used to word the reason. */
  hidesPrices: boolean;
  expiresAt?: Date | string | null;
  items?: ReadonlyArray<QuotePayLine> | null;
  /** The GST-inclusive amount payable (deposit or full). */
  amountDue: number;
  /** Payment methods this site has switched on for this shopper. */
  paymentMethodCount: number;
  /** A delivery address is on the quote, or the customer has one saved. */
  hasDeliveryAddress: boolean;
}

/** True when the quote's valid-until date has passed. Missing/unparsable ⇒ false. */
export function isPayQuoteExpired(
  expiresAt: Date | string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const t = d.getTime();
  return !Number.isNaN(t) && t < now;
}

/**
 * Resolve the Pay control's state — and, on the server, whether to refuse.
 *
 * Order matters: the reason a customer is shown should be the thing THEY can act
 * on, so "the store can't take payments" and "we need an address" outrank
 * "pricing is still being prepared".
 */
export function resolveQuotePayState(
  quote: QuotePayInput,
  now: number = Date.now()
): QuotePayState {
  const status = quote.status || "";
  if (TERMINAL_PAY_STATUSES.has(status)) return { kind: "hidden" };
  // An expired quote can't be paid; a rep extends it (card S6VEIWAA).
  if (isPayQuoteExpired(quote.expiresAt, now)) return { kind: "hidden" };
  if (!PAYABLE_STATUSES.has(status)) {
    return {
      kind: "disabled",
      reason: quote.hidesPrices ? PAY_REASON_PRICING_PENDING : PAY_REASON_NOT_READY,
    };
  }
  if (quote.hidesPrices) return { kind: "disabled", reason: PAY_REASON_PRICING_PENDING };
  if (!everyLinePriced(quote.items)) {
    return { kind: "disabled", reason: PAY_REASON_UNPRICED_LINES };
  }
  if (!(quote.amountDue > 0)) return { kind: "disabled", reason: PAY_REASON_NO_TOTAL };
  if (quote.paymentMethodCount <= 0) return { kind: "disabled", reason: PAY_REASON_NO_METHODS };
  if (!quote.hasDeliveryAddress) return { kind: "disabled", reason: PAY_REASON_NO_ADDRESS };
  return { kind: "enabled" };
}

/**
 * The line the customer must be shown on a payable quote carrying no freight.
 *
 * Steve, card 0Wy0xHuq: "When the invoice is sent, it should specify that the
 * full amount will also have to include 'Plus Freight'." A quote with no
 * delivery charge is payable as it stands (only a handful of quotes in the whole
 * system carry freight, so waiting for one would block nearly every quote) — but
 * the customer must not read the total as the final landed cost.
 */
export const PLUS_FREIGHT_NOTICE =
  "Plus Freight — delivery is not included in this amount and will be quoted separately.";
