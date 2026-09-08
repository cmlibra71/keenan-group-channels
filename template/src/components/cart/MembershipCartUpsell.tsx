import Link from "next/link";
import { Crown, Truck, ArrowRight } from "lucide-react";

// ============================================================================
// The join pitch in the cart.
//
// NO ESTIMATED SAVING. This box used to print "Members save up to $X on this
// order", where X was the cart total times a flat 15% held in
// `channel_settings.member_savings_percentage`. That number has no basis: under
// Tim's membership model (cards gk23c1VK / Nyp8bkPm, approved 2026-08-24) a
// member's price is interpolated between two trade prices whose spread differs
// SKU by SKU, so a single percentage cannot describe a basket and his pack
// forbids publishing any figure until the spread has been measured across the
// catalogue. His compliance note is why it is a hard rule and not a preference:
// a published saving has to survive an Australian Consumer Law challenge on
// substantiation. The pitch stands; the invented dollar figure does not.
//
// THE WORDS ARE TIM'S. His widget kit (gk23c1VK, `05-widget-kit.html`, "Cart
// upsell") already ships the replacement, and its order-exclusive phrasing is
// deliberate: membership reprices from the NEXT order, not this one. This box
// was written fresh first; his version says it better and is the approved copy.
// ============================================================================

export function MembershipCartUpsell({
  cartTotal,
  planPrice,
  billingInterval,
  freeShippingEnabled = false,
  freeShippingThreshold = 500,
}: {
  cartTotal: number;
  planPrice: number;
  billingInterval: string;
  /** Free-delivery messaging only renders on channels that actually offer it. */
  freeShippingEnabled?: boolean;
  freeShippingThreshold?: number;
}) {
  const freeDeliveryEligible = freeShippingEnabled && cartTotal >= freeShippingThreshold;

  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3 mb-3">
        <Crown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-zinc-900">Buying for a commercial kitchen?</h3>
          <p className="text-sm text-zinc-600 mt-1">
            Join the buying group and every line reprices from your next order &mdash; then keeps
            stepping down as your spend builds.
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
