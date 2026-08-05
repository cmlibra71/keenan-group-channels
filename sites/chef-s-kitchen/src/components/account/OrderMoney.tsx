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

/** "inc GST" / "ex GST" — which basis the figures above are currently showing. */
export function GstBasisNote({ className }: { className?: string }) {
  const { inclusive } = useGst();
  return <span className={className}>{inclusive ? "inc GST" : "ex GST"}</span>;
}
