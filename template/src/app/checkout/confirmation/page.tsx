import Link from "next/link";
import { CheckCircle, Building2, FileText } from "lucide-react";

export const metadata = {
  title: "Order Confirmed",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; pm?: string }>;
}) {
  const { order, pm } = await searchParams;

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

      {/* Payment-specific instructions */}
      {pm === "bank_transfer" && (
        <div className="mt-6 text-left bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-blue-900">Bank Transfer Details</h3>
          </div>
          <p className="text-sm text-blue-800">
            Please transfer the order total to our bank account. Use your order number <strong>{order}</strong> as the payment reference.
          </p>
          <p className="text-sm text-blue-700 mt-2">
            Bank details will be included in your confirmation email.
          </p>
        </div>
      )}

      {pm === "net_terms" && (
        <div className="mt-6 text-left bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Invoice &amp; Payment Terms</h3>
          </div>
          <p className="text-sm text-amber-800">
            An invoice will be sent to your email with payment terms. No action is required at this time.
          </p>
        </div>
      )}

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
