import { redirect } from "next/navigation";
import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();

  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  const session = await getSession();
  const subtotal = parseFloat(cart.cartAmount ?? "0");

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Checkout</h1>
      <CheckoutForm
        items={cart.items}
        subtotal={subtotal}
        customerEmail={session?.email}
      />
    </div>
  );
}
