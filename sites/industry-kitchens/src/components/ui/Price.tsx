"use client";

import { useGst, adjustForGst } from "@/lib/gst";

interface PriceProps {
  amount: number | string;
  className?: string;
  centsClassName?: string;
  centsScale?: number;
  /** When true, the amount follows the storewide GST inclusive/exclusive toggle. */
  gst?: boolean;
}

const formatter = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function Price({
  amount,
  className,
  centsClassName,
  centsScale = 0.65,
  gst = false,
}: PriceProps) {
  const { inclusive, pricesIncludeTax } = useGst();
  let num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (gst && Number.isFinite(num)) {
    num = adjustForGst(num, inclusive, pricesIncludeTax);
  }
  const formatted = formatter.format(num);
  const [dollars, cents] = formatted.split(".");

  return (
    <span className={className}>
      ${dollars}
      <span
        className={centsClassName}
        style={{ fontSize: `${centsScale}em` }}
      >
        .{cents}
      </span>
    </span>
  );
}
