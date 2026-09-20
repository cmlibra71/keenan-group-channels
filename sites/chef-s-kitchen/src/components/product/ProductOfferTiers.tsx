import { loadPromotionsForChannel, loadProductPromotionSettings, tierTableFor } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

/**
 * The carton-tier table on a product page (card p6YVxc4P, display requirement 6).
 *
 * Server component. It reads the SAME live promotions the cart evaluates and
 * derives the bands through the SAME `tierTableFor`, so a table can never
 * advertise a percentage the cart would not give. Three separate things have to
 * hold for that sentence to be true, and each of them is somewhere different:
 *
 *  • CHANNEL SCOPE — `loadPromotionsForChannel(CHANNEL_ID)`. An Industry Kitchens
 *    carton deal must not print on a Chefs Depot page; 149 of the CAP-/SC-
 *    products sit on CD.
 *  • DATE WINDOW — filtered in that loader's own SQL. It is NOT the engine's job
 *    here, because this page never reaches the engine: an expired or
 *    scheduled-future offer left `enabled` would otherwise keep advertising
 *    "4–7 cartons — 4% off" for ever.
 *  • EXCLUSIONS — two of them, and they are different mechanisms. A SKU prefix
 *    exclusion is inside the rule and `tierTableFor` applies it; the per-PRODUCT
 *    "Exclude from promotions" flag lives in `product_promotion_settings` and is
 *    read here. The dispensers this card was written around (CAP-RTDSP 2216,
 *    CAP-DCT 3094, CAP-DPILW 3485) share no sub-prefix, so the flag is the only
 *    thing that can reach them — and a flagged dispenser advertising 4%/7% and
 *    then getting nothing at the cart is precisely the case the card names.
 *
 * Draws nothing at all when this product is not in a banded offer, so it is safe
 * to render on every product page.
 *
 * The bands are MIX-AND-MATCH — the quantity is counted across every line in the
 * basket from the same range, not per product — and the table says so, because a
 * shopper reading "4–7 cartons" beside one product would otherwise reasonably
 * read it as a quantity break on THAT product, which is what `bulk_pricing_rules`
 * does two panels up.
 */
export async function ProductOfferTiers({
  sku,
  productId,
}: {
  sku: string | null;
  productId?: number | null;
}) {
  if (!sku) return null;

  let tables: ReturnType<typeof tierTableFor>[] = [];
  try {
    const id = typeof productId === "number" && Number.isFinite(productId) ? productId : null;
    const [promotions, settings] = await Promise.all([
      loadPromotionsForChannel(CHANNEL_ID),
      loadProductPromotionSettings(id == null ? [] : [id]),
    ]);
    const excluded = id != null && settings.get(id)?.excludedFromPromotions === true;
    tables = promotions.map((p) => tierTableFor(p, sku, { excluded })).filter((t) => t !== null);
  } catch {
    return null;
  }
  if (tables.length === 0) return null;

  return (
    <div className="mt-8">
      {tables.map((table) => (
        <div key={table!.label} className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">{table!.label}</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600">
                  <th className="px-3 py-2 text-left font-medium">Cartons in your cart</th>
                  <th className="px-3 py-2 text-right font-medium">You save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {table!.rows.map((row) => (
                  <tr key={row.label} className="text-zinc-700">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2 text-right">
                      {row.requestQuote ? (
                        <a href="/request-quote" className="font-medium underline">
                          Request a quote
                        </a>
                      ) : row.percent > 0 ? (
                        `${row.percent}% off`
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Mix and match across the range — the cartons are counted across your whole cart, not per
            product.
          </p>
        </div>
      ))}
    </div>
  );
}
