import Link from "next/link";
import { Crown, Truck, ArrowRight } from "lucide-react";

export function MembershipCartUpsell({
  cartTotal,
  planPrice,
  billingInterval,
}: {
  cartTotal: number;
  planPrice: number;
  billingInterval: string;
}) {
  const estimatedSavings = Math.round(cartTotal * 0.15 * 100) / 100;
  const freeDeliveryEligible = cartTotal >= 500;

  return (
    <div className="border-2 border-teal/30 bg-teal/5 p-5">
      <div className="flex items-start gap-3 mb-3">
        <Crown className="h-5 w-5 text-teal shrink-0 mt-0.5" strokeWidth={1.5} />
        <div>
          <h3 className="font-semibold text-navy">Members save on this order</h3>
          <p className="text-sm text-ink-light mt-1">
            If you were a member, you&apos;d save approximately{" "}
            <span className="font-bold text-teal">${estimatedSavings.toFixed(2)}</span> on this order.
          </p>
        </div>
      </div>

      {freeDeliveryEligible && (
        <div className="flex items-center gap-2 mb-3 text-sm text-teal-dark bg-teal/5 border border-teal/20 px-3 py-2">
          <Truck className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          Members get FREE delivery on this order
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-light">
          From ${planPrice.toFixed(2)}/{billingInterval}
        </p>
        <Link
          href="/membership"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-light"
        >
          Join now
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
