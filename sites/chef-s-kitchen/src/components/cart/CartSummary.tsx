import Link from "next/link";
import { Price } from "@/components/ui/Price";

export function CartSummary({
  subtotal,
  discount,
  total,
  isMember,
}: {
  subtotal: number;
  discount: number;
  total: number;
  isMember?: boolean;
}) {
  return (
    <div className="card-padded">
      <h2 className="panel-title mb-4">Order Summary</h2>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Subtotal</span>
          <Price amount={subtotal} className="font-medium" />
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">{isMember ? "Member Discount" : "Discount"}</span>
            <span className="font-medium text-accent">-<Price amount={discount} /></span>
          </div>
        )}
        {isMember && discount > 0 && (
          <p className="text-xs text-accent mt-1">
            You saved ${discount.toFixed(2)} with your membership!
          </p>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Shipping</span>
          <span className="font-medium text-text-muted">Calculated at checkout</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span><Price amount={total} /></span>
        </div>
      </div>

      <Link
        href="/checkout"
        className="btn-primary w-full mt-6 text-center block"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}
