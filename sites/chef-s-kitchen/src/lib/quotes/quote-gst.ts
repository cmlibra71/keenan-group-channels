/**
 * GST on a quote's stored total.
 *
 * A quote's total used to be printed here with no GST line and no label, while
 * checkout charged 10% on top — a quote reading $61.00 became a $67.10 order.
 * These pages now show the ex-GST amount, the GST and the inc-GST total, the
 * same way the cart summary does.
 *
 * The basis is not uniform, which is the whole reason this file exists:
 *  - a portal-native quote stores an EX-GST total (`tax_inclusive` false);
 *  - a Zoey-ingested quote stores Zoey's GST-INCLUSIVE grand total while
 *    `tax_inclusive` stays false, because that flag describes the LINE prices,
 *    which Zoey sends ex-GST.
 * Adding GST to a Zoey total would charge it twice.
 *
 * Zoey's grand total ALSO contains freight that has no column of its own
 * (`shipping_cost` is 0 on all 29,919 ingested quotes), so a summary of
 * "subtotal + GST = total" would not add up on the 12,520 quotes that carry
 * it. The freight is therefore reconciled out and shown as its own row.
 *
 * Mirrored byte-for-byte in template/ and both sites/*, and mirroring the
 * portal's `src/lib/quotes/quote-gst.ts` rule — the emailed quote, the quote
 * PDF and these pages must never disagree about the amount payable.
 *
 * ONE KNOWN DIFFERENCE from the portal, deliberate: the portal resolves a
 * per-quote GST rate from `quotes.tax_class_id`; these pages take the rate as
 * an argument and their callers pass the same resolved rate (see
 * `quote-gst-rate.ts`), so a GST-free tax class reads the same on both.
 */
import { gstSplit, GST_RATE } from "@keenan/services/calc";

/** Money below half a cent is rounding noise, not a component of the quote. */
export const MONEY_EPSILON = 0.005;

/** The quote fields that decide the basis of the stored total and its components. */
export interface QuoteGstInput {
  tax_inclusive?: boolean | null;
  external_source?: string | null;
  base_amount?: string | number | null;
  discount_amount?: string | number | null;
  coupon_discount?: string | number | null;
  gift_certificate_amount?: string | number | null;
  store_credit_amount?: string | number | null;
  shipping_cost?: string | number | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The total implied by the quote's own component columns, on the same basis as
 * the lines — the formula QuoteService.recalculateTotals writes:
 * base − discount − coupon − gift certificate − store credit + shipping.
 */
function componentTotal(quote: QuoteGstInput): number {
  return (
    num(quote.base_amount) -
    num(quote.discount_amount) -
    num(quote.coupon_discount) -
    num(quote.gift_certificate_amount) -
    num(quote.store_credit_amount) +
    num(quote.shipping_cost)
  );
}

/**
 * Does the stored quote total already include GST?
 *
 * Evidence beats provenance for the handful of Zoey rows whose stored total
 * equals their ex-GST components to the cent: that total plainly carries no
 * GST, and dividing it by 1.1 would under-collect.
 */
export function quoteTotalIncludesGst(quote: QuoteGstInput, total: number): boolean {
  if (quote.tax_inclusive === true) return true;
  if (quote.external_source !== "zoey") return false;
  return Math.abs(total - componentTotal(quote)) > MONEY_EPSILON;
}

/** A quote total split for display, with every component that makes it up. */
export interface QuoteGstTotals {
  exTax: number;
  tax: number;
  incTax: number;
  /** `base_amount`, ex-GST — the sum of the lines shown above the summary. */
  subtotalEx: number;
  /** Deductions, ex-GST. Zero when the quote carries none. */
  discountEx: number;
  couponEx: number;
  giftEx: number;
  creditEx: number;
  /**
   * Freight ex-GST: the quote's own `shipping_cost` plus whatever freight is
   * baked into the stored total without a column of its own.
   */
  freightEx: number;
  /** Negative balancing figure for a total sitting below its components. */
  adjustmentEx: number;
}

/** Round to cents, snapping sub-half-cent noise to a clean zero. */
function money(n: number): number {
  return Math.abs(n) < MONEY_EPSILON ? 0 : Math.round(n * 10000) / 10000;
}

/**
 * Split a quote total (the number `resolveQuoteTotal` hands back) into the
 * ex-GST / GST / inc-GST figures the customer is shown, plus the components
 * that reconcile to it:
 *
 *   subtotalEx − discountEx − couponEx − giftEx − creditEx
 *     + freightEx + adjustmentEx  ===  exTax
 */
export function quoteGstTotals(
  total: number,
  quote: QuoteGstInput,
  rate: number = GST_RATE
): QuoteGstTotals {
  const split = gstSplit(total, quoteTotalIncludesGst(quote, total), rate);
  const linesInclusive = quote.tax_inclusive === true;
  const ex = (v: unknown): number => money(gstSplit(num(v), linesInclusive, rate).exTax);

  const subtotalEx = ex(quote.base_amount);
  const discountEx = ex(quote.discount_amount);
  const couponEx = ex(quote.coupon_discount);
  const giftEx = ex(quote.gift_certificate_amount);
  const creditEx = ex(quote.store_credit_amount);
  const shippingEx = ex(quote.shipping_cost);

  const residual =
    split.exTax - (subtotalEx - discountEx - couponEx - giftEx - creditEx + shippingEx);

  return {
    exTax: split.exTax,
    tax: split.tax,
    incTax: split.incTax,
    subtotalEx,
    discountEx,
    couponEx,
    giftEx,
    creditEx,
    freightEx: money(shippingEx + Math.max(residual, 0)),
    adjustmentEx: money(Math.min(residual, 0)),
  };
}

/** True when `amount` is worth printing as its own row (i.e. not a rounded zero). */
export function isMoneyRow(amount: number): boolean {
  return Math.abs(amount) >= MONEY_EPSILON;
}
