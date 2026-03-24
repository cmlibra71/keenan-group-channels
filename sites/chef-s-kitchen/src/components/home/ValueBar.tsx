import { Crown, Truck, Trophy, Gift } from "lucide-react";

export function ValueBar() {
  const items = [
    { icon: Crown, label: "Members-Only Pricing" },
    { icon: Truck, label: "Free Delivery $500+" },
    { icon: Trophy, label: "Exclusive Prize Draws" },
    { icon: Gift, label: "Partner Discounts" },
  ];

  return (
    <section className="section-bordered">
      <div className="container-page">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-center gap-3 py-5 px-4">
              <item.icon className="h-4 w-4 text-accent shrink-0" strokeWidth={1.5} />
              <span className="text-xs font-medium text-text-body tracking-wide">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
