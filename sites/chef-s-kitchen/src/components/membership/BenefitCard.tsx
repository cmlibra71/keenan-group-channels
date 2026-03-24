import { Crown, Truck, Trophy, Gift } from "lucide-react";

const icons = {
  pricing: Crown,
  delivery: Truck,
  draws: Trophy,
  partners: Gift,
} as const;

export function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: keyof typeof icons;
  title: string;
  description: string;
}) {
  const Icon = icons[icon];
  return (
    <div className="border border-stone bg-white p-6 hover:border-teal/30 transition-colors duration-300">
      <div className="inline-flex items-center justify-center h-10 w-10 bg-offwhite text-teal mb-5">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="font-medium text-navy mb-2">{title}</h3>
      <p className="text-sm text-ink-light leading-relaxed">{description}</p>
    </div>
  );
}
