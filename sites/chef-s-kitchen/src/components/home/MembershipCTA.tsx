import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";

export function MembershipCTA({
  planPrice,
  billingInterval,
  benefits,
}: {
  planPrice: number;
  billingInterval: string;
  benefits: string[];
}) {
  return (
    <section className="bg-zinc-900 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">
              Become a Member from ${planPrice.toFixed(2)}/{billingInterval}
            </h2>
            {benefits.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {benefits.slice(0, 4).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-sm text-zinc-300">
                    <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/membership"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 text-zinc-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 transition-colors shrink-0"
          >
            Learn More
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
