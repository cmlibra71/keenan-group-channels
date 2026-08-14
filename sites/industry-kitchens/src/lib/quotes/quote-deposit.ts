/**
 * The deposit a customer may pay against a quote instead of the whole amount.
 *
 * Steve, 2026-08-07 (card 0Wy0xHuq): "Yes we need to be able to take deposits.
 * The default is a 50% deposit default. Dollar amounts or lower % is also
 * possible, and is specified by the sales rep in the Quote interface. This is
 * then shown to the customer in the front facing quote interface."
 *
 * WHERE IT LIVES. `quotes.attributes.deposit` — a jsonb bag the quote row
 * already carries (test_mode, submitted_at, requires_admin_approval all live
 * there). No migration, and nothing to keep backward-compatible one release
 * back on a blue-green deploy: a build that has never heard of deposits simply
 * ignores the key.
 *
 * WHICH BASIS. GST-INCLUSIVE, always. Customer-facing money on this platform is
 * GST-inclusive (`formatOrderMoney`, and the whole point of this card), so a
 * "50% deposit" is half of what the customer actually pays, and a rep typing
 * "$1,000" means a thousand dollars off the invoice — not $1,100. Every figure
 * in and out of this module is therefore inc-GST.
 *
 * Pure — no DB, no services. The storefront mirror of the portal's
 * `src/lib/quotes/quote-deposit.ts`, so the quote the customer pays from and the
 * quote the rep edits can never disagree about the number.
 */

/** The stored shape. `value` is a plain decimal string: "50" (percent) or "1200.00" (dollars). */
export interface QuoteDeposit {
  mode: "percent" | "amount";
  value: string;
}

/** The rep-facing default the moment a deposit is switched on (Steve: 50%). */
export const DEFAULT_DEPOSIT_PERCENT = "50";

/** Money below half a cent is rounding noise, not a deposit. Matches quote-gst.ts. */
const EPSILON = 0.005;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** 2dp — a deposit is a real amount someone is charged, not a 4dp ledger figure. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Read the deposit off a quote row's `attributes`, or null when there isn't one.
 *
 * Tolerant by design: the bag is jsonb written by several code paths, so a
 * malformed / zero / negative entry reads as "no deposit" rather than throwing
 * on a customer's quote page.
 */
export function readQuoteDeposit(attributes: unknown): QuoteDeposit | null {
  if (!attributes || typeof attributes !== "object") return null;
  const raw = (attributes as Record<string, unknown>).deposit;
  if (!raw || typeof raw !== "object") return null;
  const bag = raw as Record<string, unknown>;
  const mode = bag.mode === "amount" ? "amount" : bag.mode === "percent" ? "percent" : null;
  if (!mode) return null;
  const value = num(bag.value);
  if (!(value > 0)) return null;
  return { mode, value: String(bag.value) };
}

/**
 * Normalise a rep's input into a storable deposit, or null to clear it.
 *
 * Percentages are clamped to (0, 100] — 100% is "pay it all", and anything above
 * would ask for more than the invoice. Dollar amounts are clamped at 0 and left
 * otherwise alone here; the cap against the quote total happens at display time
 * in {@link resolveQuoteDeposit}, because the total moves as the rep edits lines
 * and a stored value that silently shrank with it would be a nasty surprise.
 */
export function normaliseQuoteDeposit(
  mode: string | null | undefined,
  value: string | number | null | undefined
): QuoteDeposit | null {
  if (mode !== "percent" && mode !== "amount") return null;
  const n = num(value);
  if (!(n > 0)) return null;
  if (mode === "percent") {
    const pct = Math.min(100, round2(n));
    return { mode: "percent", value: String(pct) };
  }
  return { mode: "amount", value: round2(n).toFixed(2) };
}

/** The deposit resolved against a real quote total. */
export interface ResolvedDeposit {
  mode: "percent" | "amount";
  /** The stored percentage, for wording ("50% deposit"). Null on a dollar deposit. */
  percent: number | null;
  /** Amount due now, inc GST, 2dp, never above the total and never below zero. */
  due_now: number;
  /** The rest, inc GST, 2dp. Zero when the deposit covers the whole quote. */
  balance: number;
  /** The total this was resolved against, inc GST, 2dp. */
  total_inc: number;
}

/**
 * Turn a stored deposit + a GST-inclusive total into the two figures a customer
 * is shown: pay now, and the balance.
 *
 * Returns null when there is no deposit, or when it works out at (or above) the
 * whole total — a "deposit" of 100% is just paying the invoice, and printing a
 * $0.00 balance beside it reads as a mistake.
 */
export function resolveQuoteDeposit(
  deposit: QuoteDeposit | null,
  totalIncGst: string | number | null | undefined
): ResolvedDeposit | null {
  if (!deposit) return null;
  const total = round2(num(totalIncGst));
  if (!(total > EPSILON)) return null;

  const raw =
    deposit.mode === "percent" ? (total * num(deposit.value)) / 100 : num(deposit.value);
  const dueNow = round2(Math.max(0, Math.min(total, raw)));
  if (dueNow <= EPSILON) return null;
  if (total - dueNow <= EPSILON) return null;

  return {
    mode: deposit.mode,
    percent: deposit.mode === "percent" ? num(deposit.value) : null,
    due_now: dueNow,
    balance: round2(total - dueNow),
    total_inc: total,
  };
}

/**
 * Plain-English label for the deposit line, e.g. "Deposit due now (50%)" or
 * "Deposit due now". Shared so the quote page, the PDF, the email and the
 * storefront all word it identically.
 */
export function depositLabel(resolved: ResolvedDeposit): string {
  return resolved.percent != null
    ? `Deposit due now (${formatPercent(resolved.percent)}%)`
    : "Deposit due now";
}

/** "50" not "50.00"; "12.5" kept. */
export function formatPercent(pct: number): string {
  return String(round2(pct));
}
