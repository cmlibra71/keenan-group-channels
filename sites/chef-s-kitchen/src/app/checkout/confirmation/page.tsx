import Link from "next/link";
import { CheckCircle } from "lucide-react";

export const metadata = {
  title: "Order Confirmed",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-6 lg:px-8 py-20 sm:py-24 text-center">
      <CheckCircle className="h-16 w-16 text-teal mx-auto" />

      <h1 className="mt-6 text-3xl heading-serif text-navy">Order Confirmed</h1>

      <p className="mt-4 text-ink-light">
        Thank you for your order! Your order number is:
      </p>

      {order && (
        <p className="mt-2 text-xl font-semibold text-navy">{order}</p>
      )}

      <p className="mt-4 text-sm text-ink-light">
        You will receive an email confirmation shortly.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/account/orders"
          className="bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
        >
          View Orders
        </Link>
        <Link
          href="/products"
          className="border border-stone text-ink px-7 py-3.5 font-medium text-sm tracking-wide hover:border-navy/30 transition-colors duration-300"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
