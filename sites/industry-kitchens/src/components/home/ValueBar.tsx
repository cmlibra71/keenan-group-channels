import { Crown, Truck, Trophy, Gift } from "lucide-react";

export function ValueBar({ drawsEnabled = true }: { drawsEnabled?: boolean }) {
  const allItems = [
    { icon: Crown, label: "Members-Only Pricing", key: "pricing" },
    { icon: Truck, label: "Free Delivery $500+", key: "delivery" },
    { icon: Trophy, label: "Prize Draws", key: "draws" },
    { icon: Gift, label: "Partner Discounts", key: "partners" },
  ];
  const items = drawsEnabled ? allItems : allItems.filter((i) => i.key !== "draws");

  return (
    <section className="bg-green-50 border-y border-green-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <item.icon className="h-4 w-4 text-green-700 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-green-800">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
