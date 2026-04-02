"use client";

interface PriceProps {
  amount: number | string;
  className?: string;
  centsClassName?: string;
  centsScale?: number;
  showExGst?: boolean;
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
  showExGst = false,
}: PriceProps) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = formatter.format(num);
  const [dollars, cents] = formatted.split(".");

  return (
    <span className={`${className ?? ""} ${showExGst ? "inline-flex flex-col" : ""}`}>
      <span>
        ${dollars}
        <span
          className={centsClassName}
          style={{ fontSize: `${centsScale}em` }}
        >
          .{cents}
        </span>
      </span>
      {showExGst && (
        <span className="text-[0.38em] font-normal text-text-muted leading-tight">ex GST</span>
      )}
    </span>
  );
}
