"use client";
// Pure presentational — it only ever imported a TYPE from the store, so the
// boundary move changes what ships to the browser, not what is drawn. Needed so
// the Site Builder natives can render the same component the live page does,
// rather than a second copy that would drift.

import {
  Crown,
  Truck,
  Trophy,
  Gift,
  ShieldCheck,
  Lock,
  CreditCard,
  Award,
  Package,
  Headset,
  type LucideIcon,
} from "lucide-react";
import type { ValueBarItem } from "@/lib/store";

const ICON_MAP: Record<string, LucideIcon> = {
  crown: Crown,
  truck: Truck,
  trophy: Trophy,
  gift: Gift,
  "shield-check": ShieldCheck,
  lock: Lock,
  "credit-card": CreditCard,
  award: Award,
  package: Package,
  headset: Headset,
};

// Trust-badge row: icon + title + description per item, matching the original
// industrykitchens.com.au info banner.
export function ValueBar({ items }: { items: ValueBarItem[] }) {
  if (items.length === 0) return null;
  const cols =
    items.length === 3
      ? "sm:grid-cols-3"
      : items.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <section className="bg-zinc-50 border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={`grid grid-cols-1 ${cols} divide-y sm:divide-y-0 sm:divide-x divide-zinc-200`}
        >
          {items.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Package;
            return (
              <div key={item.title} className="flex items-start gap-3 py-6 sm:px-6">
                <Icon className="h-8 w-8 shrink-0 text-zinc-700" strokeWidth={1.4} />
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-zinc-900">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-snug text-zinc-500">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
