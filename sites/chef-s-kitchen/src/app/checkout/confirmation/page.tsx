import Link from "next/link";
import { CheckCircle, Building2, FileText, CreditCard } from "lucide-react";

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
      <CheckCircle className="h-16 w-16 text-brand mx-auto" />

      <h1 className="page-title mt-6">Order Confirmed</h1>

      <p className="mt-4 text-steel-500">
        Thank you for your order! Your order number is:
      </p>

      {order && (
        <p className="mt-2 text-xl font-semibold text-ink-900">{order}</p>
      )}

      <p className="mt-4 text-sm text-steel-500">
        You will receive an email confirmation shortly.
      </p>

      {/* Payment-specific instructions */}
      {pm === "stripe" && (
        <div className="mt-6 text-left bg-brand-tint border border-brand-light/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-brand-deep">Payment Successful</h3>
          </div>
          <p className="text-sm text-brand-deep">
            Your card payment has been processed successfully. A receipt will be sent to your email.
          </p>
        </div>
      )}

      {pm === "bank_transfer" && (
        <div className="mt-6 text-left bg-accent-subtle border border-accent/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-accent-dark">Bank Transfer Details</h3>
          </div>
          <p className="text-sm text-accent-dark">
            Please transfer the order total to our bank account. Use your order number <strong>{order}</strong> as the payment reference.
          </p>
          <p className="text-sm text-accent-dark mt-2">
            Bank details will be included in your confirmation email.
          </p>
        </div>
      )}

      {pm === "net_terms" && (
        <div className="mt-6 text-left bg-member-bg border border-member/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-member-text" />
            <h3 className="text-sm font-semibold text-member-text">Invoice &amp; Payment Terms</h3>
          </div>
          <p className="text-sm text-member-text">
            An invoice will be sent to your email with payment terms. No action is required at this time.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/account/orders"
          className="btn-primary"
        >
          View Orders
        </Link>
        <Link
          href="/products"
          className="border border-steel-300 text-ink-700 px-6 py-3 rounded-lg font-semibold hover:border-steel-400 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
