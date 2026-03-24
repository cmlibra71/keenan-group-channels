"use client";

import { useEffect, useRef, useState } from "react";

const milestones = [
  { month: 1, entries: 1, total: 1 },
  { month: 3, entries: 3, total: 6 },
  { month: 6, entries: 6, total: 21 },
  { month: 12, entries: 12, total: 78 },
];

export function EntryAccumulationChart({ currentMonth }: { currentMonth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxTotal = milestones[milestones.length - 1].total;

  return (
    <div ref={ref} className="space-y-5">
      {milestones.map((m) => {
        const pct = (m.total / maxTotal) * 100;
        const isCurrentPosition = currentMonth != null && currentMonth >= m.month && (m === milestones[milestones.length - 1] || currentMonth < milestones[milestones.indexOf(m) + 1].month);

        return (
          <div key={m.month} className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-body font-medium">
                Month {m.month}
                {isCurrentPosition && (
                  <span className="ml-2 text-xs text-accent font-medium">You are here</span>
                )}
              </span>
              <span className="text-text-primary font-semibold">{m.total} entries</span>
            </div>
            <div className="h-2.5 bg-border overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-1000 ease-out"
                style={{ width: visible ? `${pct}%` : "0%" }}
              />
            </div>
            <p className="caption">
              +{m.entries} new {m.entries === 1 ? "entry" : "entries"} this month
            </p>
          </div>
        );
      })}
      <p className="mt-5 text-sm text-text-body font-medium card px-5 py-3.5 bg-white">
        Cancel and you lose all entries. Stay and they keep growing.
      </p>
    </div>
  );
}
