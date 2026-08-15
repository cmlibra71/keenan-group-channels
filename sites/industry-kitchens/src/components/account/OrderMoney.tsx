import { Price } from "@/components/ui/Price";

/**
 * A money figure from an order.
 *
 * GST-INCLUSIVE, always, and formatted by the same `Price` the Order History list
 * formats the total with — those two screens quoting different figures for one
 * order is the bug this component exists to make impossible (card Roy0kIEz). It
 * deliberately does NOT read the storewide "Excluding GST" toggle: that toggle
 * lives on product pages only (Steve, 2026-08-05, card 33HGX8U2), and a customer's
 * own order is a record of what was charged, not a catalogue price to re-base.
 *
 * The amount handed in is already the inclusive figure — see `gstInclusiveAmount`
 * in `lib/orders/order-presentation.ts`, which is where the stored ex/inc columns
 * are reconciled. A single number is the ONLY thing that crosses to the client:
 * the order row itself (internal memo, staff notes, per-line cost prices) never
 * becomes a prop, because an RSC prop is serialised into the flight payload even
 * when it is not rendered.
 */
export function OrderMoney({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return <Price amount={amount} className={className} />;
}

/**
 * The money breakdown of an order: the rows, the total, and the GST line.
 *
 * Every figure is GST-inclusive, so the column reads down to the same total the
 * customer saw on Order History a click earlier. The rows arrive already reconciled
 * to that total (see `orderTotalRows`), so the column a customer reads always adds
 * up, and the GST they paid is stated beneath it rather than requiring them to work
 * it out.
 *
 * "Includes GST" is printed only when the order records tax. On 704 of Industry
 * Kitchens' imported orders `total_tax` is zero, and some of those genuinely
 * carried no GST while others simply never recorded it — printing "$0.00" would
 * state a fact we do not have. Saying nothing is honest.
 *
 * Numbers and row labels are the only props: the order row never crosses to the
 * client, since an RSC prop ships in the flight payload even when nothing renders it.
 */
export function OrderTotals({
  rows,
  total,
  gst,
}: {
  rows: ReadonlyArray<{ label: string; amount: number }>;
  total: number;
  gst: number;
}) {
  return (
    <div className="mt-4 border-t border-border pt-4 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{row.label}</span>
          <Price amount={row.amount} className="text-text-primary" />
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-medium text-text-secondary">Order Total (inc GST)</span>
        <Price amount={total} className="text-lg font-semibold text-text-primary" />
      </div>

      {gst > 0 && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Includes GST</span>
          <Price amount={gst} />
        </div>
      )}
    </div>
  );
}
