/**
 * When a customer may see a quote's prices, and when they may accept it.
 *
 * The single definition behind the My Quotes list, the quote detail page and the
 * server-side accept gate. Mirrored byte-for-byte in template/ and both sites/*,
 * and kept in step with the portal's emailed-link quote view
 * (keenan-group-portal → src/lib/quotes/accept-state.ts) so the signed-in website
 * view and the emailed link behave identically.
 *
 * Two rules matter most here:
 *
 *  1. $0 is a PRICE, not a missing price. Roughly a third of zero-priced lines are
 *     ordinary products someone deliberately zeroed; the rest are note-style
 *     entries. Labelling either "Requires quote" misleads the customer, so a $0
 *     line renders "$0.00" like any other line whenever prices are visible.
 *  2. Acceptance is gated on the QUOTE, never on its lines. A $0 line must never
 *     block acceptance.
 */

/**
 * Statuses that hide prices when `quotes.hide_prices` is null (legacy rows that
 * predate the column). Exactly the statuses seeded with hidePrices=true in
 * @keenan/services SYSTEM_QUOTE_STATUSES. Never used when the column has a value,
 * and never a substitute for the table when it can be read.
 */
export const FALLBACK_HIDE_PRICE_STATUSES: ReadonlySet<string> = new Set([
  "created",
  "quote_pending",
  "open_change_request",
]);

/** Quote states where an Accept button is noise rather than information. */
const TERMINAL_ACCEPT_STATUSES: ReadonlySet<string> = new Set([
  "quote_accepted",
  "converted_to_order",
  "quote_cancelled",
  "quote_expired",
]);

export const ACCEPT_REASON_PRICING_PENDING = "Pricing is still being prepared";
export const ACCEPT_REASON_NOT_READY = "This quote isn't ready to accept yet";

export interface PriceVisibilityQuote {
  status?: string | null;
  /** quotes.hide_prices — authoritative when set, null means "use the fallback set". */
  hide_prices?: boolean | null;
}

/**
 * Whether this quote's prices are hidden from the customer.
 *
 * Driven by the quote's own `hide_prices` value (which the portal recomputes from
 * the editable `quote_statuses.hide_prices` column on every status change), falling
 * back to the status set ONLY when the column is null. A status configured to hide
 * prices in portal settings is therefore honoured without any hardcoded list here.
 */
export function quoteHidesPrices(
  quote: PriceVisibilityQuote,
  hideStatuses: ReadonlySet<string> = FALLBACK_HIDE_PRICE_STATUSES
): boolean {
  if (quote.hide_prices !== null && quote.hide_prices !== undefined) {
    return Boolean(quote.hide_prices);
  }
  return hideStatuses.has(quote.status || "");
}

const QUOTE_PRICE_FIELDS = [
  "base_amount",
  "discount_amount",
  "shipping_cost",
  "quote_amount",
] as const;

const ITEM_PRICE_FIELDS = [
  "list_price",
  "sale_price",
  "extended_list_price",
  "extended_sale_price",
  "discount_amount",
] as const;

/**
 * Return a COPY of the quote with every price field nulled, for quotes whose
 * pricing isn't visible yet. Visually hiding a price still ships the raw number in
 * the page source / RSC payload — this is what actually keeps it off the wire.
 *
 * A copy rather than an in-place mutation on purpose: service rows can end up
 * behind `unstable_cache`, and a mutated row would poison unrelated cached reads.
 */
export function redactQuotePrices<T extends object>(quote: T): T {
  const out: Record<string, unknown> = { ...(quote as Record<string, unknown>) };
  for (const f of QUOTE_PRICE_FIELDS) out[f] = null;
  const items = out.items;
  if (Array.isArray(items)) {
    out.items = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const copy: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      for (const f of ITEM_PRICE_FIELDS) copy[f] = null;
      return copy;
    });
  }
  return out as T;
}

export type QuoteAcceptState =
  /** Don't render an Accept control at all (terminal / already dealt with). */
  | { kind: "hidden" }
  /** Live, clickable Accept. */
  | { kind: "enabled" }
  /** Visible but greyed out, with this reason on hover. */
  | { kind: "disabled"; reason: string };

export interface QuoteAcceptInput {
  status?: string | null;
  /**
   * The ALREADY-RESOLVED price visibility (see `quoteHidesPrices`) — so this
   * function never has to know the fallback rule. Only used to word the reason.
   */
  hidesPrices: boolean;
  expires_at?: Date | string | null;
}

/** True when the quote's valid-until date has passed. Missing/unparsable ⇒ false. */
export function isQuoteExpired(
  expiresAt: Date | string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const t = d.getTime();
  return !Number.isNaN(t) && t < now;
}

/**
 * Resolve the Accept control's state — and, on the server, whether to refuse.
 *
 * - hidden   → terminal status, or the valid-until date has passed
 * - enabled  → priced and sent (`quote_available`) and still in date
 * - disabled → everything else (created / quote_pending / open_change_request /
 *              quote_on_hold), with a reason the customer can act on
 *
 * `open_change_request` is deliberately NOT acceptable: the customer has asked for
 * changes and the re-quote hasn't come back, so there is nothing settled to accept.
 */
export function resolveQuoteAcceptState(
  quote: QuoteAcceptInput,
  now: number = Date.now()
): QuoteAcceptState {
  const status = quote.status || "";
  if (TERMINAL_ACCEPT_STATUSES.has(status)) return { kind: "hidden" };
  if (isQuoteExpired(quote.expires_at, now)) return { kind: "hidden" };
  if (status === "quote_available") return { kind: "enabled" };
  return {
    kind: "disabled",
    reason: quote.hidesPrices ? ACCEPT_REASON_PRICING_PENDING : ACCEPT_REASON_NOT_READY,
  };
}
