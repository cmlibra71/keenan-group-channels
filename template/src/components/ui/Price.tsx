"use client";

import { useGst, adjustForGst } from "@/lib/gst";

interface PriceProps {
  amount: number | string;
  className?: string;
  centsClassName?: string;
  centsScale?: number;
  /** When true, the amount follows the storewide GST inclusive/exclusive toggle. */
  gst?: boolean;
  /** When true, render a small stacked "ex GST"/"inc GST" label under the amount. */
  showGstLabel?: boolean;
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
  showGstLabel = false,
}: PriceProps) {
  const { inclusive, pricesIncludeTax } = useGst();
  let num = typeof amount === "string" ? parseFloat(amount) : amount;
  // Never render "$NaN" from a null/blank/non-numeric amount — show a neutral dash.
  if (!Number.isFinite(num)) {
    return <span className={className}>&mdash;</span>;
  }
  if (gst) {
    num = adjustForGst(num, inclusive, pricesIncludeTax);
  }
  // The sign belongs OUTSIDE the dollar sign: "-$22.00", never "$-22.00". Splitting
  // the formatted string leaves the minus attached to the dollars, which is how a
  // refunded order's total and a discount row came to read "$-1,008.52".
  const negative = num < 0;
  const formatted = formatter.format(Math.abs(num));
  const [dollars, cents] = formatted.split(".");
  const sign = negative ? "-" : "";

  // The label reflects the toggle when the amount follows it, else the stored basis.
  const gstLabel = (gst ? inclusive : pricesIncludeTax) ? "inc GST" : "ex GST";

  if (showGstLabel) {
    return (
      <span className={`${className ?? ""} inline-flex flex-col`}>
        <span>
          {sign}${dollars}
          <span className={centsClassName} style={{ fontSize: `${centsScale}em` }}>
            .{cents}
          </span>
        </span>
        <span className="text-[0.38em] font-normal text-text-muted leading-tight">{gstLabel}</span>
      </span>
    );
  }

  return (
    <span className={className}>
      {sign}${dollars}
      <span
        className={centsClassName}
        style={{ fontSize: `${centsScale}em` }}
      >
        .{cents}
      </span>
    </span>
  );
}
