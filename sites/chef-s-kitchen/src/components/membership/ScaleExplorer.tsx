"use client";

import { useMemo, useState } from "react";

/**
 * "See how the price moves" — the Chefs Depot member price scale, explained by
 * moving a slider (card gk23c1VK — Tim's LOCKED 11 Sep 2026 model).
 *
 * THERE ARE NO LEVELS. A member's price moves continuously with their rolling
 * twelve-month spend, from the advertised price at $0 down to our deepest member
 * price at `topSpend` ($50,000). This shows WHERE a spend sits on that scale —
 * "42.0% of the way", and the spend still to go — and nothing else.
 *
 * NO PRICE AND NO SAVING PERCENTAGE, and none may be added: the distance between
 * the two ends is set per item by how hard the group buys it, so the catalogue
 * has no single saving figure, and Tim's pack forbids publishing one until the
 * spread distribution has been measured. "42.0% of the way" is a POSITION, not a
 * discount — the same framing his widgets use.
 *
 * Accessibility is part of the spec: operable by keyboard alone (a native range
 * input, so arrows and Home/End work), announces the position it reaches through
 * `aria-valuetext` and an `aria-live` region, and respects
 * `prefers-reduced-motion` (the transition is disabled by `motion-reduce:`).
 */
export function ScaleExplorer({
  topSpend = 50_000,
  maxSpend = 60_000,
}: {
  /** Spend that reaches the deepest member price. */
  topSpend?: number;
  /** Where the slider stops — past the top, to show the scale caps there. */
  maxSpend?: number;
}) {
  // Most members live at the low end, so a curve gives finer steps there
  // without a second control (Tim's explorer squares the slider the same way).
  const CURVE = 2;
  const [position, setPosition] = useState(59);

  const money0 = useMemo(
    () => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }),
    []
  );

  const spend = Math.round((Math.pow(position / 100, CURVE) * maxSpend) / 100) * 100;
  const share = Math.min(spend / topSpend, 1);
  const pct = `${(Math.floor(share * 1000) / 10).toFixed(1)}%`;
  const toGo = Math.max(topSpend - spend, 0);

  return (
    <div className="rounded-2xl border border-border-strong bg-white p-6 sm:p-8">
      <label htmlFor="cd-scale-spend" className="block text-sm font-semibold text-text-primary">
        Your spend — one order or many
      </label>
      <p className="mt-1 text-xs text-text-secondary">
        ex GST, freight and installation · across any rolling twelve months
      </p>

      <p className="mt-4 heading-serif text-4xl text-text-primary">{money0.format(spend)}</p>

      <input
        id="cd-scale-spend"
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-describedby="cd-scale-note"
        aria-valuetext={`${money0.format(spend)} — ${pct} of the way to our deepest member price`}
        className="mt-5 w-full accent-accent"
      />
      <div className="flex justify-between text-xs text-text-secondary">
        <span>{money0.format(0)}</span>
        <span>{money0.format(maxSpend)}+</span>
      </div>

      {/* Where that spend sits. aria-live so a keyboard user hears it move. */}
      <div className="mt-6 rounded-xl bg-surface-secondary p-5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="heading-serif text-2xl text-text-primary">{pct}</p>
          <p className="text-sm text-text-secondary">
            {toGo > 0 ? `${money0.format(toGo)} to go` : "at our deepest member price"}
          </p>
        </div>
        <div className="mt-4 h-1.5 w-full rounded-full bg-border-strong/40">
          <div
            className="h-1.5 rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-text-secondary">
          <span>The advertised price</span>
          <span>Our deepest member price</span>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          At {money0.format(spend)} you&rsquo;d be {pct} of the way to our deepest member price.
        </p>
      </div>

      <p id="cd-scale-note" className="mt-5 text-xs leading-relaxed text-text-secondary">
        <span className="font-semibold text-text-primary">Reference only.</span> This shows how your
        pricing moves, not what you&rsquo;ll pay. One large order counts the same as a year of small
        ones. The range is set product by product by how hard the group buys — on the brands and
        items we move most of, there is more room in it, and on others less. Non-members pay our
        standard price, which sits at the top of the range.
      </p>
    </div>
  );
}
