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
    <div className="rounded-xl border border-zinc-200 bg-white p-6 hover:shadow-md transition-shadow">
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-amber-50 text-amber-600 mb-4">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-zinc-900 mb-2">{title}</h3>
      <p className="text-sm text-zinc-600 leading-relaxed">{description}</p>
    </div>
  );
}
