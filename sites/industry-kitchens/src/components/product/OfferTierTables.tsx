// ============================================================================
// The carton-tier table's MARKUP (card p6YVxc4P), split from its loading (IK hidden-conditionals
// audit C13) so it can be drawn from already-loaded tables — by `ProductOfferTiers` below the
// product tree, and by the `product-offer-tiers` native a product template places itself. No
// hooks, no data access: the numbers are `loadOfferTierTables`' (the cart's own `tierTableFor`,
// clamped at the floor), never worked out here.
// ============================================================================

export interface OfferTierTable {
  label: string;
  rows: Array<{ label: string; percent: number; requestQuote?: boolean }>;
}

export function OfferTierTables({ tables }: { tables: OfferTierTable[] }) {
  if (!tables || tables.length === 0) return null;
  return (
    <div className="mt-8">
      {tables.map((table) => (
        <div key={table.label} className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">{table.label}</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600">
                  <th className="px-3 py-2 text-left font-medium">Cartons in your cart</th>
                  <th className="px-3 py-2 text-right font-medium">You save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {table.rows.map((row) => (
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
