"use client";

import { useGst } from "@/lib/gst";
import { Price } from "@/components/ui/Price";

/**
 * A money figure from an order, following the storewide "Excluding GST" toggle.
 *
 * An order stores BOTH exact figures (`*_ex_tax` and `*_inc_tax`) as they were at
 * checkout, so the toggle picks a stored column rather than re-deriving tax —
 * a historical order must show the tax it was actually charged, not today's rate.
 *
 * The ONLY thing that crosses to the client is the two numbers. The order row
 * itself (internal memo, staff notes, per-line cost prices) never becomes a prop:
 * an RSC prop is serialised into the flight payload even when it is not rendered.
 */
export function OrderMoney({
  exTax,
  incTax,
  className,
}: {
  exTax: number;
  incTax: number;
  className?: string;
}) {
  const { inclusive } = useGst();
  return <Price amount={inclusive ? incTax : exTax} className={className} />;
}

/**
 * The money breakdown of an order: the rows, the total, and the GST line.
 *
 * Client-side only because the GST toggle decides both the figures AND the shape:
 * showing GST-exclusive prices means the total is quoted ex GST with the tax and
 * the inc-GST total stated beneath it — exactly how the cart summary reads — while
 * inclusive prices carry the tax as a single "includes GST" memo. Every row is
 * handed in already reconciled to the total (see `orderTotalRows`), so the column
 * a customer reads always adds up.
 *
 * Numbers and row labels are the only props: the order row never crosses to the
 * client, since an RSC prop ships in the flight payload even when nothing renders it.
 */
export function OrderTotals({
  rows,
  totalExTax,
  totalIncTax,
  gst,
}: {
  rows: Array<{ label: string; exTax: number; incTax: number }>;
  totalExTax: number;
  totalIncTax: number;
  gst: number;
}) {
  const { inclusive } = useGst();

  return (
    <div className="mt-4 border-t border-border pt-4 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{row.label}</span>
          <Price amount={inclusive ? row.incTax : row.exTax} className="text-text-primary" />
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-medium text-text-secondary">
          Order Total {inclusive ? "(inc GST)" : "(ex GST)"}
        </span>
        <Price
          amount={inclusive ? totalIncTax : totalExTax}
          className="text-lg font-semibold text-text-primary"
        />
      </div>

      {inclusive ? (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Includes GST</span>
          <Price amount={gst} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>GST</span>
            <Price amount={gst} />
          </div>
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Total (inc GST)</span>
            <Price amount={totalIncTax} className="font-medium" />
          </div>
        </>
      )}
    </div>
  );
}
