import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
    <section className="section-dark">
      {/* Subtle asymmetric accent */}
      <div className="absolute bottom-0 left-0 w-2/3 h-px bg-gradient-to-r from-accent/40 to-transparent" />

      <div className="relative container-page py-16 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left — editorial type */}
          <div className="lg:col-span-7">
            <p className="eyebrow mb-4">Membership</p>
            <h2 className="heading-serif text-3xl sm:text-4xl text-white">
              From ${planPrice.toFixed(2)}/{billingInterval}
            </h2>
            {benefits.length > 0 && (
              <ul className="mt-6 flex flex-col sm:flex-row flex-wrap gap-x-8 gap-y-3">
                {benefits.slice(0, 4).map((benefit, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-slate-400">
                    <span className="h-px w-4 bg-accent/60 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right — CTA */}
          <div className="lg:col-span-5 lg:text-right">
            <Link
              href="/membership"
              className="btn-primary inline-flex items-center gap-2.5"
            >
              Learn More
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
