import Link from "next/link";
import { ShoppingCart } from "lucide-react";

export const metadata = {
  title: "Cart",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Your Cart</h1>

      {/* Empty state - cart functionality requires client-side state management */}
      <div className="text-center py-16">
        <ShoppingCart className="h-16 w-16 text-zinc-300 mx-auto" />
        <p className="mt-4 text-zinc-500">Your cart is empty.</p>
        <Link
          href="/products"
          className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
