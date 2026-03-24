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
    <div className="mx-auto max-w-lg px-6 lg:px-8 section-padding text-center">
      <CheckCircle className="h-16 w-16 text-accent mx-auto" />

      <h1 className="mt-6 text-3xl heading-serif text-text-primary">Order Confirmed</h1>

      <p className="mt-4 text-text-secondary">
        Thank you for your order! Your order number is:
      </p>

      {order && (
        <p className="mt-2 text-xl font-semibold text-text-primary">{order}</p>
      )}

      <p className="mt-4 text-sm text-text-secondary">
        You will receive an email confirmation shortly.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/account/orders"
          className="btn-primary"
        >
          View Orders
        </Link>
        <Link
          href="/products"
          className="btn-secondary"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
