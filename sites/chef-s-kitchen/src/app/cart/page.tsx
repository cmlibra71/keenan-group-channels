import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { CartItemsList } from "@/components/cart/CartItemsList";
import { CartSummary } from "@/components/cart/CartSummary";

export const metadata = {
  title: "Cart",
};

export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Your Cart</h1>
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

  const subtotal = parseFloat(cart!.baseAmount ?? "0");
  const discount = parseFloat(cart!.discountAmount ?? "0");
  const total = parseFloat(cart!.cartAmount ?? "0");

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Your Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <CartItemsList items={items} />
        </div>
        <div>
          <CartSummary subtotal={subtotal} discount={discount} total={total} />
        </div>
      </div>
    </div>
  );
}
