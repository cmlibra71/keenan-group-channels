import Link from "next/link";
import { Crown, Truck, ArrowRight } from "lucide-react";

export function MembershipCartUpsell({
  cartTotal,
  planPrice,
  billingInterval,
  savingsPercentage = 15,
}: {
  cartTotal: number;
  planPrice: number;
  billingInterval: string;
  savingsPercentage?: number;
}) {
  const estimatedSavings = Math.round(cartTotal * (savingsPercentage / 100) * 100) / 100;
  const freeDeliveryEligible = cartTotal >= 500;

  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3 mb-3">
        <Crown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-zinc-900">Members save up to</h3>
          <p className="text-sm text-zinc-600 mt-1">
            Members save up to{" "}
            <span className="font-bold text-amber-700">${estimatedSavings.toFixed(2)}</span> on this order.
          </p>
        </div>
      </div>

      {freeDeliveryEligible && (
        <div className="flex items-center gap-2 mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Truck className="h-4 w-4 shrink-0" />
          Members get FREE delivery on this order
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          From ${planPrice.toFixed(2)}/{billingInterval}
        </p>
        <Link
          href="/membership"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800"
        >
          Join now
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
