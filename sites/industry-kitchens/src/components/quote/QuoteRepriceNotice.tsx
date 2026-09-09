import { TrendingDown, TrendingUp } from "lucide-react";
import type { QuoteDeltaSummary } from "@keenan/services/member-ladder";
import { quoteDeltaNotice } from "@keenan/services/member-ladder";

/**
 * "Surface the delta, always" on the SIGNED-IN quote page (card gk23c1VK,
 * blueprint §9.3 / AC 19).
 *
 * The storefront twin of the portal's `src/components/quotes/quote-reprice-notice.tsx`.
 * A Chefs Depot quote is an estimate that reprices against live trade data and
 * the account's buying-group level, and `/account/quotes/[id]` is a real
 * acceptance AND payment door — so the buyer must read the same per-line
 * movement here that they read on the emailed `/q/<uuid>` copy. The arithmetic
 * and the sentence both come from `@keenan/services/member-ladder`, so the two
 * screens cannot disagree about one quote.
 *
 * PRE-ACCEPTANCE ONLY, and `acceptanceOpen` is REQUIRED so no caller can forget
 * it (blueprint AC 20a). Acceptance price-LOCKS the quote, but the underlying
 * comparison is earliest-audit-row against latest — it keeps moving after
 * acceptance while the money owed does not. Ungated, an accepted quote would
 * head itself "Before you accept" forever and would eventually print a price
 * the customer is not being charged. Pass
 * `resolveQuoteAcceptState(...).kind !== "hidden"`, the same predicate the
 * Accept button uses.
 *
 * THE BASIS IS NOT THIS PANEL'S TO PICK. The comparison is held ex-GST (the
 * basis `cd_price_audit` records), and `quoteRepriceDeltas` converts it once,
 * at the quote's own rate, onto the quote's own basis before it reaches any
 * surface; `linesIncludeGst` describes what came out. Print it unconverted: the
 * Items list directly beneath comes from `quote_items.sale_price`, which is
 * inc-GST on a tax-inclusive quote. Converting again here shows the customer
 * two prices for one line, ~10% apart.
 *
 * Money formats through the page's own en-AU currency formatter, not a local
 * `toFixed(2)`, so the panel cannot print "$1449.25" above an Items list
 * printing "$1,449.25" for the same line.
 *
 * Renders NOTHING when nothing moved — the ordinary case, and a panel saying
 * "no change" trains people to ignore it.
 */
export function QuoteRepriceNotice({
  summary,
  acceptanceOpen,
  currency = "AUD",
}: {
  summary: QuoteDeltaSummary;
  acceptanceOpen: boolean;
  currency?: string | null;
}) {
  if (!summary.hasChanges) return null;
  if (!acceptanceOpen) return null;
  const notice = quoteDeltaNotice(summary);

  const code = typeof currency === "string" && currency.length === 3 ? currency : "AUD";
  const moneyFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: code });
  const signedFmt = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: code,
    signDisplay: "always",
  });
  const money = (v: number) => moneyFmt.format(v);
  const signed = (v: number) => signedFmt.format(v);
  const basis =
    summary.gstRate <= 0
      ? "This quote is GST-free."
      : summary.linesIncludeGst
        ? "Prices shown include GST."
        : "Prices shown exclude GST.";

  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">Before you accept</h2>
      <p className="mt-1 text-sm text-amber-900">{notice}</p>

      <ul className="mt-3 divide-y divide-amber-200/70">
        {summary.lines.map((line) => {
          const Icon = line.direction === "up" ? TrendingUp : TrendingDown;
          return (
            <li key={String(line.lineId)} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-amber-900">{line.name ?? line.sku ?? "Item"}</p>
                {line.sku && line.name && (
                  <p className="truncate text-xs text-amber-800/80">{line.sku}</p>
                )}
                {line.levelChanged && (
                  <p className="text-xs text-amber-800/80">
                    Your buying level changed from {line.levelAtIssue ?? "—"} to{" "}
                    {line.levelNow ?? "—"}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="text-amber-900">
                  <span className="line-through opacity-70">{money(line.unitAtIssue)}</span> →{" "}
                  <span className="font-semibold">{money(line.unitNow)}</span>
                </p>
                <p className="flex items-center justify-end gap-1 text-xs text-amber-800">
                  <Icon className="h-3 w-3" />
                  {signed(line.unitDelta)} each
                  {line.quantity > 1 ? ` · ${signed(line.lineDelta)} on this line` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-amber-800">
        {basis} The totals below already use the new prices.
      </p>
    </section>
  );
}
