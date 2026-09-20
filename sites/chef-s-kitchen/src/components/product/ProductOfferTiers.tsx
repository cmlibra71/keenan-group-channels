import { loadPromotionsForChannel, tierTableFor } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

/**
 * The carton-tier table on a product page (card p6YVxc4P, display requirement 6).
 *
 * Server component. It reads the SAME live promotions the cart evaluates and
 * derives the bands through the SAME `tierTableFor`, so a table can never
 * advertise a percentage the cart would not give — including the channel scope,
 * the date window and the SKU exclusions (a dispenser inside the CAP- range gets
 * no table, because it gets no discount).
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
export async function ProductOfferTiers({ sku }: { sku: string | null }) {
  if (!sku) return null;

  let tables: ReturnType<typeof tierTableFor>[] = [];
  try {
    const promotions = await loadPromotionsForChannel(CHANNEL_ID);
    tables = promotions.map((p) => tierTableFor(p, sku)).filter((t) => t !== null);
  } catch {
    return null;
  }
  if (tables.length === 0) return null;

  return (
    <div className="mt-8">
      {tables.map((table) => (
        <div key={table!.label} className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-700">{table!.label}</h3>
          <div className="overflow-hidden rounded-lg border border-steel-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-steel-50 text-steel-600">
                  <th className="px-3 py-2 text-left font-medium">Cartons in your cart</th>
                  <th className="px-3 py-2 text-right font-medium">You save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {table!.rows.map((row) => (
                  <tr key={row.label} className="text-ink-700">
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
          <p className="mt-2 text-xs text-steel-500">
            Mix and match across the range — the cartons are counted across your whole cart, not per
            product.
          </p>
        </div>
      ))}
    </div>
  );
}
