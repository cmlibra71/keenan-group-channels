import Link from "next/link";

export const metadata = {
  title: "Checkout",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {/* Shipping */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Shipping Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">First Name</label>
                <input type="text" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Last Name</label>
                <input type="text" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-700">Address</label>
                <input type="text" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">City</label>
                <input type="text" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Postal Code</label>
                <input type="text" className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Payment</h2>
            <p className="text-sm text-zinc-500">Payment integration to be configured per site.</p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="border border-zinc-200 rounded-lg p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order Summary</h2>
            <p className="text-sm text-zinc-500">Your cart is empty.</p>
            <div className="mt-6 border-t border-zinc-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Subtotal</span>
                <span className="font-medium">$0.00</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-zinc-500">Shipping</span>
                <span className="font-medium">--</span>
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-zinc-200">
                <span>Total</span>
                <span>$0.00</span>
              </div>
            </div>
            <button className="mt-6 w-full bg-zinc-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300" disabled>
              Place Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
