import Link from "next/link";
import { gstOnExWholeCents, gstSplit } from "@keenan/services/calc";
import { qualifiesForFreeDelivery } from "@/lib/checkout/shipping";
import {
  brandFreeShippingMessage,
  type MatchedBrandSpecial,
} from "@/lib/checkout/free-shipping-brands-policy";
import { Price } from "@/components/ui/Price";

export function CartSummary({
  subtotal,
  discount,
  specialSaving = 0,
  offerDiscount = 0,
  total,
  isMember,
  pricesIncludeTax,
  freeShippingEnabled,
  freeShippingThreshold = 500,
  brandSpecial = null,
}: {
  subtotal: number;
  discount: number;
  /** What the Partner Special lines are below list (card tJ4audbu) — its own row, never a member saving. */
  specialSaving?: number;
  /** What the carton bands, the cross-range kicker or a bundle took off (card p6YVxc4P). */
  offerDiscount?: number;
  total: number;
  isMember?: boolean;
  pricesIncludeTax?: boolean;
  freeShippingEnabled?: boolean;
  freeShippingThreshold?: number;
  /** The brand free-shipping special this cart earns, if any (card 88Ay7UGA). */
  brandSpecial?: MatchedBrandSpecial | null;
}) {
  // GST display amount. On an ex-GST store it is the shared WHOLE-CENT rule (`gstOnExWholeCents`) —
  // the same one the product page's Estimated Subtotal and pack line use, so a line and the basket
  // agree to the cent on half-cent ties (money judge 2026-09-30). A GST-inclusive store keeps
  // `gstSplit` (services D4).
  const gstAmount = pricesIncludeTax
    ? Math.round(gstSplit(total, true).tax * 100) / 100
    : gstOnExWholeCents(total).tax;

  const freeDelivery = qualifiesForFreeDelivery({
    enabled: !!freeShippingEnabled,
    isMember: !!isMember,
    amount: total,
    threshold: freeShippingThreshold,
    brandFreeShipping: !!brandSpecial,
  });

  return (
    <div className="border border-zinc-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order Summary</h2>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Subtotal</span>
          <Price amount={subtotal} className="font-medium" />
        </div>
        {/* A Partner Special is its own row: it is every shopper's price, so its saving is
            never a "Discount" and never the membership's (card tJ4audbu). */}
        {specialSaving > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Partner Special</span>
            <span className="font-medium text-green-600">-<Price amount={specialSaving} /></span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">{isMember ? "Member Discount" : "Discount"}</span>
            <span className="font-medium text-green-600">-<Price amount={discount} /></span>
          </div>
        )}
        {isMember && discount > 0 && (
          <p className="text-xs text-green-600 mt-1">
            You saved ${discount.toFixed(2)} with your membership!
          </p>
        )}
        {/* An offer is its own row, never folded into "Discount": the two are
            different money and the order records them separately — member pricing
            is inside the line price, an offer is order_items.discount_amount.
            (Card p6YVxc4P.) */}
        {offerDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Offers</span>
            <span className="font-medium text-green-600">-<Price amount={offerDiscount} /></span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">GST {pricesIncludeTax ? "(included)" : "(10%)"}</span>
          <Price amount={gstAmount} className={`font-medium ${pricesIncludeTax ? "text-zinc-400" : ""}`} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Shipping</span>
          {freeDelivery ? (
            <span className="font-medium text-green-600">FREE</span>
          ) : (
            <span className="font-medium text-zinc-400">Calculated at checkout</span>
          )}
        </div>
        {brandSpecial && (
          <p className="text-xs text-green-600">{brandFreeShippingMessage(brandSpecial)}</p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-200">
        <div className="flex justify-between text-base font-semibold">
          <span>Total {!pricesIncludeTax && "(ex GST)"}</span>
          <span><Price amount={total} /></span>
        </div>
        {!pricesIncludeTax && (
          <div className="flex justify-between text-sm text-zinc-500 mt-1">
            <span>Total (inc GST)</span>
            <Price amount={total + gstAmount} className="font-medium" />
          </div>
        )}
      </div>

      <Link
        href="/checkout"
        className="mt-6 block w-full bg-zinc-900 text-white text-center py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}
