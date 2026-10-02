// ============================================================================
// The fixed bundle bar's ADD TO QUOTE (IK parity: Zoey's "Price as configured" bar) — the event
// the page's `addBundleToQuote` action raises and a kit native answers with its own picks.
// Shared by every storefront's BuilderProductPage; only a storefront whose kit native listens
// (Industry Kitchens) ever answers it, so elsewhere the action simply reports "no configuration".
// ============================================================================

/**
 * Zoey's fixed "Price as configured" bar carries its own quantity box and ADD TO QUOTE, but the
 * picks live in the kit native. The template's bar fires the `addBundleToQuote` action, which
 * raises this window event; the kit native answers it with ITS picks and the bar's quantity, through
 * the same add as its own button, and resolves the result for the bar's toast. IK only.
 */
export const KIT_ADD_TO_QUOTE_EVENT = "kg:kit-add-to-quote";
export interface KitAddToQuoteDetail {
  productId: number;
  quantity: number | null;
  /** Set (synchronously) by the kit native that takes the press. */
  handled: boolean;
  resolve: (result: { success?: boolean; error?: string }) => void;
}

/** The bar's quantity box value → a whole number of units, or null for "one". */
export function barQuantity(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 10000) : null;
}
