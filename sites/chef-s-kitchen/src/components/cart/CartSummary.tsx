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
    <div className="border border-stone p-6">
      <h2 className="text-lg heading-serif text-navy mb-4">Order Summary</h2>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-ink-light">Subtotal</span>
          <Price amount={subtotal} className="font-medium" />
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-ink-light">Discount</span>
            <span className="font-medium text-teal">-<Price amount={discount} /></span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-ink-light">Shipping</span>
          <span className="font-medium text-ink-faint">Calculated at checkout</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-stone">
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span><Price amount={total} /></span>
        </div>
      </div>

      <Link
        href="/checkout"
        className="mt-6 block w-full bg-teal text-white text-center px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}
