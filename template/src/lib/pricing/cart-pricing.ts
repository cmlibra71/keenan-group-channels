// ============================================================================
// Cart-item pricing core — the pure "which price do we charge" decision.
//
// The cart's effective per-unit charge is layered, best-price-wins, over three
// sources: the channel's catalog sale price, the member (cost-plus) price for an
// active subscriber, and bulk quantity-break tiers. On member-only cost-plus
// channels (Chef's Depot) the shared catalog sale price AND bulk tiers are
// suppressed — RRP applies without a membership.
//
// Previously this decision lived inline in `resolveItemPricing` (lib/actions/cart.ts)
// interleaved with ~10 DB/session calls, so the correctness rules — "take the
// member price only if it's lower", "a bulk tier never beats an existing sale",
// tier min/max matching, percent-vs-price tiers — could only be exercised by
// driving a whole cart against the database. They are pure arithmetic; this module
// is their testable home (see cart-pricing.test.ts). The action is now a thin
// fetch-then-layer shell.
//
// Money crosses as strings (Postgres numeric; services CONTEXT.md D3); callers
// parse as needed.
// ============================================================================

/** A bulk quantity-break rule row (snake_case, as bulkPricingRuleService returns). */
export type BulkRule = {
  quantity_min: number | string;
  quantity_max: number | string | null;
  /** "price" = absolute per-unit amount; "percent" = discount off the list (RRP) price. */
  type: string;
  amount: string;
};

/**
 * The best (lowest) per-unit price from a product's bulk tiers for a given
 * quantity, or null if no tier applies. Mirrors how the PDP renders the Bulk
 * Pricing table. Pure: pass the already-fetched rules in.
 */
export function pickBestBulkUnit(
  rules: BulkRule[],
  quantity: number,
  listPrice: number
): number | null {
  let best: number | null = null;
  for (const r of rules) {
    const min = Number(r.quantity_min);
    const max = r.quantity_max == null ? null : Number(r.quantity_max);
    if (quantity < min || (max != null && quantity > max)) continue;
    const amt = parseFloat(r.amount);
    if (!Number.isFinite(amt)) continue;
    const unit = r.type === "percent" ? listPrice * (1 - amt / 100) : amt;
    if (Number.isFinite(unit) && (best == null || unit < best)) best = unit;
  }
  return best;
}

export type CartPriceInputs = {
  listPrice: string;
  /** The channel's public sale price for this line, or null. */
  catalogSalePrice: string | null;
  /** Member-only cost-plus channel: suppress the shared catalog sale price + bulk tiers. */
  suppress: boolean;
  /** Resolved effective member (cost-plus) price for an active subscriber, or null. */
  memberSalePrice: string | null;
  /** Best bulk unit price for the quantity, or null (callers pass null when suppressed). */
  bulkUnit: number | null;
};

/**
 * Layers the price sources, best-price-wins, into the { listPrice, salePrice }
 * stored on a cart line. Order (matches the historical inline logic exactly):
 *   1. start from the catalog sale price,
 *   2. suppression zeroes it (RRP applies),
 *   3. member price wins only if it is lower (a null current sale means member wins),
 *   4. a bulk tier wins only if it is below the current effective price.
 */
export function layerCartPrice(input: CartPriceInputs): { listPrice: string; salePrice: string | null } {
  const { listPrice, catalogSalePrice, suppress, memberSalePrice, bulkUnit } = input;

  let salePrice: string | null = catalogSalePrice;

  if (suppress) salePrice = null;

  if (memberSalePrice) {
    salePrice =
      salePrice && parseFloat(salePrice) < parseFloat(memberSalePrice)
        ? salePrice
        : memberSalePrice;
  }

  if (!suppress && bulkUnit != null) {
    const currentEffective = salePrice != null ? parseFloat(salePrice) : parseFloat(listPrice);
    if (bulkUnit < currentEffective) salePrice = String(bulkUnit);
  }

  return { listPrice, salePrice };
}
