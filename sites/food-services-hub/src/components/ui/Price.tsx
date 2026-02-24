"use client";

interface PriceProps {
  amount: number | string;
  className?: string;
  centsClassName?: string;
  centsScale?: number;
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
}: PriceProps) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
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
