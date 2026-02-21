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
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-16 text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />

      <h1 className="mt-6 text-3xl font-bold text-zinc-900">Order Confirmed</h1>

      <p className="mt-4 text-zinc-600">
        Thank you for your order! Your order number is:
      </p>

      {order && (
        <p className="mt-2 text-xl font-semibold text-zinc-900">{order}</p>
      )}

      <p className="mt-4 text-sm text-zinc-500">
        You will receive an email confirmation shortly.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/account/orders"
          className="bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
        >
          View Orders
        </Link>
        <Link
          href="/products"
          className="border border-zinc-300 text-zinc-700 px-6 py-3 rounded-lg font-semibold hover:border-zinc-400 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
