import Link from "next/link";
import { Price } from "@/components/ui/Price";

export function CartSummary({
  subtotal,
  discount,
  total,
}: {
  subtotal: number;
  discount: number;
  total: number;
}) {
  return (
    <div className="border border-zinc-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order Summary</h2>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Subtotal</span>
          <Price amount={subtotal} className="font-medium" />
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Discount</span>
            <span className="font-medium text-green-600">-<Price amount={discount} /></span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Shipping</span>
          <span className="font-medium text-zinc-400">Calculated at checkout</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-200">
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span><Price amount={total} /></span>
        </div>
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
