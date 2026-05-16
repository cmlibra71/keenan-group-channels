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

export type ValueBarItem = { icon: string; label: string };

export function ValueBar({ items }: { items: ValueBarItem[] }) {
  if (items.length === 0) return null;
  const cols = items.length === 3 ? "lg:grid-cols-3" : items.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
  return (
    <section className="bg-green-50 border-y border-green-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className={`grid grid-cols-2 ${cols} gap-3 lg:gap-6`}>
          {items.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Package;
            return (
              <div key={item.label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-green-700 shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-green-800">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
