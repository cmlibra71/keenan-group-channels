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
  total,
  isMember,
  pricesIncludeTax,
  freeShippingEnabled,
  freeShippingThreshold = 500,
  brandSpecial = null,
}: {
  subtotal: number;
  discount: number;
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
