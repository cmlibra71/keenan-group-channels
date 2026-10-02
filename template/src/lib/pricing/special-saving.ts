// What a basket's PARTNER SPECIAL lines are below their regular list price (card tJ4audbu).
//
// A special is every shopper's price — members, trade groups and contract accounts included —
// and Tim's badge says "Partner Special - No further discounts". So the gap between a special
// line's list price and the special is the SPECIAL's saving, never a membership's: the cart and
// checkout print it on its own "Partner Special" row instead of folding it into "Discount" /
// "Member Discount" / "You saved $X with your membership!", and `memberSavings` (order-draft)
// leaves those lines out of the saving it records on the order.
//
// Pure and import-free, so the client cart island can use it.

export type SpecialSavingLine = {
  product_id: number | null;
  list_price: string | null;
  sale_price: string | null;
  quantity: number;
};

/** The saving on the lines whose product is on a live special, rounded to the cent. */
export function partnerSpecialSaving(
  items: readonly SpecialSavingLine[],
  onSpecial: ReadonlySet<number>
): number {
  let saved = 0;
  for (const item of items) {
    if (item.product_id == null || !onSpecial.has(item.product_id)) continue;
    const list = parseFloat(item.list_price ?? "");
    const charged = item.sale_price ? parseFloat(item.sale_price) : list;
    if (!Number.isFinite(list) || !Number.isFinite(charged)) continue;
    const perUnit = list - charged;
    // Half a cent of tolerance, as memberSavings keeps: rounding noise is not a saving.
    if (perUnit <= 0.005) continue;
    saved += perUnit * item.quantity;
  }
  return Math.round(saved * 100) / 100;
}
