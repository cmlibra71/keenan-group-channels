import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Design-system membership value strip: warm-ink panel with a gold radial glow,
 * a serif headline, four gold-tick perks, and the price box with the Join CTA.
 *
 * The headline used to read "Members save 10–25% on every order". It had no
 * measured basis and it misdescribed the reference price, so card gk23c1VK
 * replaced it: under the buying-group model there is no single saving figure,
 * because the distance between the entry and floor trade prices is set item by
 * item by how hard the group buys it. Do not reintroduce a percentage here —
 * one may only be published from a measured spread across the catalogue.
 */
export function MembershipValueStrip({
  planPrice,
  billingInterval,
  benefits,
}: {
  planPrice: number;
  billingInterval: string;
  benefits: string[];
}) {
  const perks = (benefits.length > 0
    ? benefits
    : [
        "Members-only pricing",
        "Australia-wide delivery",
        "Exclusive partner discounts",
        "Priority customer support",
      ]
  ).slice(0, 4);

  return (
    <section className="container-page section-padding">
      <div className="relative grid items-center gap-8 overflow-hidden rounded-panel bg-surface-dark p-9 text-white lg:grid-cols-[1.3fr_1fr] lg:px-10">
        {/* Gold radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[60px] -top-[60px] h-[260px] w-[260px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(233,185,73,.32), transparent 70%)" }}
        />

        <div className="relative">
          <h3 className="heading-serif mb-2 text-[28px] text-white">
            Members buy at a{" "}
            <em className="not-italic text-member-bright">different price tier</em>, from their
            first order.
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {perks.map((perk) => (
              <div key={perk} className="flex items-center gap-2.5 text-[13.5px] text-white/85">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-member text-[11px] font-bold text-ink-900">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {perk}
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-card border border-white/[0.14] bg-white/[0.06] p-6 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Membership from
          </p>
          <p className="mt-1 text-[38px] font-bold leading-none tracking-tight">
            ${planPrice.toFixed(2)}
            <small className="text-[15px] font-semibold text-steel-400">/{billingInterval === "month" ? "mo" : billingInterval}</small>
          </p>
          <Link href="/membership" className="btn-gold mt-5 w-full">
            Join now
          </Link>
        </div>
      </div>
    </section>
  );
}
