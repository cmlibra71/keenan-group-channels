import { getCommerceDb, taxRates } from "@keenan/services";
import { GST_RATE } from "@keenan/services/calc";
import { eq } from "drizzle-orm";

/**
 * The GST rate that applies to one quote, from its tax class (AU GST 10% when
 * the quote carries no class — which is all but two quotes in production; a
 * GST-free class resolves to 0 so ex == inc and no GST is shown).
 *
 * Mirrors the portal's `src/lib/quotes/quote-gst-rate.ts`. Without it these
 * pages would print GST on a quote the portal's own /q page (and the order it
 * converts to) treats as GST-free — the exact class of disagreement the quote
 * GST work exists to remove. A quote with no tax class costs no query at all.
 */
export async function resolveQuoteGstRate(taxClassId: unknown): Promise<number> {
  const id = Number(taxClassId);
  if (!Number.isFinite(id) || id <= 0) return GST_RATE;
  try {
    const [row] = await getCommerceDb()
      .select({ rate: taxRates.rate })
      .from(taxRates)
      .where(eq(taxRates.taxClassId, id))
      .limit(1);
    if (row?.rate != null) return Number(row.rate) / 100; // stored as percent (10 → 0.10)
  } catch {
    /* keep the AU default rather than dropping GST */
  }
  return GST_RATE;
}
