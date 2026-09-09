"use client";

import { useMemo, useState } from "react";

export interface ExplorerLevel {
  id: string;
  label: string;
  threshold: number;
}

/**
 * "See how the price moves" — the buying-group ladder, explained by moving a
 * slider (card gk23c1VK).
 *
 * It shows WHICH LEVEL a spend reaches and nothing else. There is no percentage
 * anywhere in this component and none may be added: the distance between the
 * entry and floor prices is set per item by how hard the group buys it, so the
 * catalogue has no single saving figure and cannot be made to produce one. Any
 * published figure has to come from a measured M-to-R spread across the whole
 * catalogue, which does not exist yet — so the page renders nothing rather than
 * guess. (Blueprint §10 and the compliance note in §13.)
 *
 * Accessibility is part of the spec, not a nicety: the ladder is operable by
 * keyboard alone (a native range input, so arrows and Home/End work), announces
 * the level it reaches to a screen reader, and respects `prefers-reduced-motion`
 * — the transitions below are disabled by the media query in globals.css rather
 * than by a script, so they are off before the first paint.
 */
export function LadderExplorer({
  levels,
  maxSpend = 12000,
}: {
  levels: ExplorerLevel[];
  maxSpend?: number;
}) {
  // The slider is not linear: most members live at the low end, so a curve buys
  // finer granularity there without a second control.
  const CURVE = 2.2;
  const [position, setPosition] = useState(62);

  const money0 = useMemo(
    () => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }),
    []
  );

  const spend = Math.round((Math.pow(position / 100, CURVE) * maxSpend) / 50) * 50;

  const reached = useMemo(() => {
    let current = levels[0];
    for (const level of levels) if (spend >= level.threshold) current = level;
    return current;
  }, [levels, spend]);

  const reachedIndex = levels.findIndex((l) => l.id === reached?.id);
  const progress = levels.length > 1 ? (reachedIndex / (levels.length - 1)) * 100 : 0;

  if (!reached) return null;

  return (
    <div className="rounded-2xl border border-border-strong bg-white p-6 sm:p-8">
      <label htmlFor="cd-ladder-spend" className="block text-sm font-semibold text-text-primary">
        Your spend — one order or many
      </label>
      <p className="mt-1 text-xs text-text-secondary">
        ex GST, freight and installation · across any rolling twelve months
      </p>

      <p className="mt-4 heading-serif text-4xl text-text-primary">{money0.format(spend)}</p>

      <input
        id="cd-ladder-spend"
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-describedby="cd-ladder-note"
        aria-valuetext={`${money0.format(spend)} — ${reached.label}`}
        className="mt-5 w-full accent-accent"
      />
      <div className="flex justify-between text-xs text-text-secondary">
        <span>{money0.format(0)}</span>
        <span>{money0.format(maxSpend)}+</span>
      </div>

      {/* The rung reached. aria-live so a keyboard user hears the level change. */}
      <div className="mt-6 rounded-xl bg-surface-secondary p-5" aria-live="polite">
        <p className="heading-serif text-2xl text-text-primary">{reached.label}</p>
        <p className="mt-1 text-sm text-text-secondary">
          threshold {money0.format(reached.threshold)}
        </p>
        <div className="mt-4 h-1.5 w-full rounded-full bg-border-strong/40">
          <div
            className="h-1.5 rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-text-secondary">
          <span>{levels[0]?.label} — where member pricing starts</span>
          <span>{levels[levels.length - 1]?.label} — our deepest trade price</span>
        </div>
      </div>

      <p id="cd-ladder-note" className="mt-5 text-xs leading-relaxed text-text-secondary">
        <span className="font-semibold text-text-primary">Reference only.</span> This shows how your
        pricing moves, not what you&rsquo;ll pay. One large order counts the same as a year of small
        ones. The range is set product by product by how hard the group buys — on the brands and
        items we move most of, there is more room in it, and on others less. Non-members pay our
        standard price, which sits above the whole range.
      </p>
    </div>
  );
}
