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
    <div className="card-interactive">
      <div className="inline-flex items-center justify-center h-10 w-10 bg-surface-primary text-accent mb-5">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="font-medium text-text-primary mb-2">{title}</h3>
      <p className="body-text">{description}</p>
    </div>
  );
}
