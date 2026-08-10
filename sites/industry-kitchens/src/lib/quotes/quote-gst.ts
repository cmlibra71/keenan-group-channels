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
 * Mirrored byte-for-byte in template/ and both sites/*, and kept in step with
 * the portal's `src/lib/quotes/quote-gst.ts` — the emailed quote, the quote PDF
 * and these pages must never disagree about the amount payable.
 */
import { gstSplit } from "@keenan/services/calc";

/** The quote fields that decide the basis of the stored total. */
export interface QuoteGstInput {
  tax_inclusive?: boolean | null;
  external_source?: string | null;
}

/** Does the stored quote total already include GST? */
export function quoteTotalIncludesGst(quote: QuoteGstInput): boolean {
  return quote.tax_inclusive === true || quote.external_source === "zoey";
}

/** A quote total split for display. */
export interface QuoteGstTotals {
  exTax: number;
  tax: number;
  incTax: number;
}

/**
 * Split a quote total (the number `resolveQuoteTotal` hands back) into the
 * ex-GST / GST / inc-GST figures the customer is shown.
 */
export function quoteGstTotals(total: number, quote: QuoteGstInput): QuoteGstTotals {
  return gstSplit(total, quoteTotalIncludesGst(quote));
}
