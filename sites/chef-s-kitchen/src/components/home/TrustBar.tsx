import { Crown, Truck, Gift } from "lucide-react";

/**
 * Design-system trust bar: warm ink band directly beneath the hero with the
 * rust/teal/gold accent stripe on top and three gold-icon value props.
 */
export function TrustBar() {
  const items = [
    { icon: Crown, label: "Members-Only Pricing" },
    { icon: Truck, label: "Australia-Wide Delivery" },
    { icon: Gift, label: "Partner Discounts" },
  ];
  return (
    <div className="relative bg-surface-dark before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[linear-gradient(90deg,var(--color-sale)_0_33%,var(--color-accent-bright)_33%_66%,var(--color-member)_66%_100%)]">
      <div className="container-page">
        <div className="flex h-16 items-center justify-around text-white">
          {items.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 text-xs font-semibold sm:text-sm">
              <Icon className="h-5 w-5 text-member" strokeWidth={1.7} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
