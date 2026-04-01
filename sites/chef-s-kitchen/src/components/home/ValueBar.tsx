import { Crown, Truck, Trophy, Gift } from "lucide-react";

const items = [
  { icon: Crown, label: "Members-Only Pricing", accent: "from-amber-500 to-amber-600" },
  { icon: Truck, label: "Australia-Wide Delivery", accent: "from-teal-500 to-teal-600" },
  { icon: Trophy, label: "Exclusive Prize Draws", accent: "from-violet-500 to-violet-600" },
  { icon: Gift, label: "Partner Discounts", accent: "from-rose-500 to-rose-600" },
];

export function ValueBar() {
  return (
    <section className="bg-zinc-900 border-y border-zinc-800">
      {/* Desktop: horizontal row */}
      <div className="hidden md:block container-page">
        <div className="grid grid-cols-4">
          {items.map((item, i) => (
            <div
              key={item.label}
              className="relative group flex items-center justify-center gap-3 py-6 px-4"
            >
              {/* Gradient top accent line */}
              <div className={`absolute top-0 left-4 right-4 h-0.5 bg-gradient-to-r ${item.accent} opacity-60`} />
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-white shrink-0" strokeWidth={1.5} />
                <span className="text-sm font-semibold text-white tracking-wide">{item.label}</span>
              </div>
              {/* Divider between items */}
              {i < items.length - 1 && (
                <div className="absolute right-0 top-3 bottom-3 w-px bg-zinc-700" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: scrollable compact pills */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 overflow-x-auto scrollbar-none">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 shrink-0 bg-gradient-to-r ${item.accent} rounded-full px-3.5 py-1.5`}
          >
            <item.icon className="h-3.5 w-3.5 text-white shrink-0" strokeWidth={2} />
            <span className="text-xs font-bold text-white whitespace-nowrap">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
