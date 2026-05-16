import {
  ShieldCheck,
  Truck,
  Award,
  Headset,
  Package,
  Wrench,
  Sparkles,
  Crown,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "shield-check": ShieldCheck,
  truck: Truck,
  award: Award,
  headset: Headset,
  package: Package,
  wrench: Wrench,
  sparkles: Sparkles,
  crown: Crown,
};

export type WhyShopItem = { icon?: string; heading: string; body?: string };

export function WhyShop({ heading, items }: { heading?: string; items?: WhyShopItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        {heading && (
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-10">{heading}</h2>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((it) => {
            const Icon = it.icon ? ICON_MAP[it.icon] ?? Award : Award;
            return (
              <div key={it.heading} className="flex flex-col gap-3">
                <Icon className="h-6 w-6 text-amber-600" />
                <h3 className="text-base font-semibold text-zinc-900">{it.heading}</h3>
                {it.body && <p className="text-sm text-zinc-600 leading-relaxed">{it.body}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
