import Link from "next/link";
import { Crown, Truck, ArrowRight } from "lucide-react";

export function MembershipCartUpsell({
  cartTotal,
  planPrice,
  billingInterval,
  savingsPercentage = 15,
  freeShippingEnabled = false,
  freeShippingThreshold = 500,
}: {
  cartTotal: number;
  planPrice: number;
  billingInterval: string;
  savingsPercentage?: number;
  /** Free-delivery messaging only renders on channels that actually offer it. */
  freeShippingEnabled?: boolean;
  freeShippingThreshold?: number;
}) {
  const estimatedSavings = Math.round(cartTotal * (savingsPercentage / 100) * 100) / 100;
  const freeDeliveryEligible = freeShippingEnabled && cartTotal >= freeShippingThreshold;

  return (
    <div className="rounded-xl border-2 border-member/40 bg-member-bg p-5">
      <div className="flex items-start gap-3 mb-3">
        <Crown className="h-5 w-5 text-member-text shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-ink-900">Members save up to</h3>
          <p className="text-sm text-steel-500 mt-1">
            Members save up to{" "}
            <span className="font-bold text-member-text">${estimatedSavings.toFixed(2)}</span> on this order.
          </p>
        </div>
      </div>

      {freeDeliveryEligible && (
        <div className="flex items-center gap-2 mb-3 text-sm text-brand-deep bg-brand-tint border border-brand-light/40 rounded-lg px-3 py-2">
          <Truck className="h-4 w-4 shrink-0" />
          Members get FREE delivery on this order
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-steel-500">
          From ${planPrice.toFixed(2)}/{billingInterval}
        </p>
        <Link
          href="/membership"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-member-text hover:text-member-text"
        >
          Join now
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
