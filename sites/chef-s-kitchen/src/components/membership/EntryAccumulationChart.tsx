"use client";

import { useEffect, useRef, useState } from "react";

// Generate real cumulative entry data: month N earns N entries, cumulative = N*(N+1)/2
function generateProgression(months: number) {
  const data = [];
  let cumulative = 0;
  for (let m = 1; m <= months; m++) {
    cumulative += m;
    data.push({ month: m, entriesThisMonth: m, total: cumulative });
  }
  return data;
}

const DISPLAY_MONTHS = 12;
const progression = generateProgression(DISPLAY_MONTHS);
const maxTotal = progression[progression.length - 1].total; // 78

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

  return (
    <div ref={ref} className="space-y-3">
      <p className="text-sm text-zinc-600 mb-4">
        You earn entries each month you stay subscribed. Month 1 = 1 entry, Month 2 = 2 more, and so on.
        Your entries accumulate — the longer you stay, the better your chances.
      </p>

      {progression.map((m) => {
        const pct = (m.total / maxTotal) * 100;
        const isCurrent = currentMonth != null && currentMonth === m.month;
        const isPast = currentMonth != null && currentMonth > m.month;

        return (
          <div key={m.month} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={`font-medium ${isCurrent ? "text-amber-700" : "text-zinc-600"}`}>
                Month {m.month}
                {isCurrent && (
                  <span className="ml-2 text-xs text-amber-600 font-semibold">You are here</span>
                )}
              </span>
              <span className="text-zinc-900 font-bold">{m.total} entries</span>
            </div>
            <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${
                  isCurrent
                    ? "bg-gradient-to-r from-amber-500 to-amber-400"
                    : isPast
                      ? "bg-gradient-to-r from-amber-400 to-amber-300"
                      : "bg-gradient-to-r from-amber-400 to-amber-500"
                }`}
                style={{ width: visible ? `${pct}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-zinc-500">
              +{m.entriesThisMonth} new {m.entriesThisMonth === 1 ? "entry" : "entries"} this month
            </p>
          </div>
        );
      })}
      <p className="mt-4 text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        Cancel and you lose all entries. Stay and they keep growing.
      </p>
    </div>
  );
}
