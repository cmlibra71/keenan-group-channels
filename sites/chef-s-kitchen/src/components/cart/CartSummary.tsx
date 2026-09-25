import Link from "next/link";
import { gstSplit } from "@keenan/services/calc";
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
  // GST display amount via gstSplit (single source of tax math — services D4).
  const gstAmount = Math.round(gstSplit(total, !!pricesIncludeTax).tax * 100) / 100;

  const freeDelivery = qualifiesForFreeDelivery({
    enabled: !!freeShippingEnabled,
    isMember: !!isMember,
    amount: total,
    threshold: freeShippingThreshold,
    brandFreeShipping: !!brandSpecial,
  });

  return (
    <div className="border border-steel-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-ink-900 mb-4">Order Summary</h2>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-steel-500">Subtotal</span>
          <Price amount={subtotal} className="font-medium" />
        </div>
        {/* A Partner Special is its own row: it is every shopper's price, so its saving is
            never a "Discount" and never the membership's (card tJ4audbu). */}
        {specialSaving > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-steel-500">Partner Special</span>
            <span className="font-medium text-brand">-<Price amount={specialSaving} /></span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-steel-500">{isMember ? "Member Discount" : "Discount"}</span>
            <span className="font-medium text-brand">-<Price amount={discount} /></span>
          </div>
        )}
        {isMember && discount > 0 && (
          <p className="text-xs text-brand mt-1">
            You saved ${discount.toFixed(2)} with your membership!
          </p>
        )}
        {/* An offer is its own row, never folded into "Discount": the two are
            different money and the order records them separately — member pricing
            is inside the line price, an offer is order_items.discount_amount.
            (Card p6YVxc4P.) */}
        {offerDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-steel-500">Offers</span>
            <span className="font-medium text-brand">-<Price amount={offerDiscount} /></span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-steel-500">GST {pricesIncludeTax ? "(included)" : "(10%)"}</span>
          <Price amount={gstAmount} className={`font-medium ${pricesIncludeTax ? "text-steel-400" : ""}`} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-steel-500">Shipping</span>
          {freeDelivery ? (
            <span className="font-medium text-brand">FREE</span>
          ) : (
            <span className="font-medium text-steel-400">Calculated at checkout</span>
          )}
        </div>
        {brandSpecial && (
          <p className="text-xs text-brand">{brandFreeShippingMessage(brandSpecial)}</p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-steel-200">
        <div className="flex justify-between text-base font-semibold">
          <span>Total {!pricesIncludeTax && "(ex GST)"}</span>
          <span><Price amount={total} /></span>
        </div>
        {!pricesIncludeTax && (
          <div className="flex justify-between text-sm text-steel-500 mt-1">
            <span>Total (inc GST)</span>
            <Price amount={total + gstAmount} className="font-medium" />
          </div>
        )}
      </div>

      <Link
        href="/checkout"
        className="btn-primary mt-6 w-full"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}
