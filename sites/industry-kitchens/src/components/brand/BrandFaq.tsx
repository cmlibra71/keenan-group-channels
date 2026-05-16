"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type FaqItem = { q: string; a: string };

export function BrandFaq({ heading, items }: { heading?: string; items?: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-zinc-900 mb-6">
        {heading ?? "Frequently Asked Questions"}
      </h2>
      <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg overflow-hidden bg-white">
        {items.map((item, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
            >
              <span className="text-sm font-semibold text-zinc-900">{item.q}</span>
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${
                  open === i ? "rotate-180" : ""
                }`}
              />
            </button>
            {open === i && (
              <div className="px-5 pb-4 text-sm text-zinc-600 leading-relaxed">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
