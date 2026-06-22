import Link from "next/link";
import { CheckCircle, Building2, FileText, CreditCard } from "lucide-react";
import { getCheckoutSettings } from "@/lib/store";

export const metadata = {
  title: "Order Confirmed",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; pm?: string }>;
}) {
  const { order, pm } = await searchParams;

  // Load the configured bank-transfer / net-terms details so the customer has
  // what they need to pay even though there is no confirmation email yet.
  let bankDetails:
    | { bankName: string; accountName: string; bsb: string; accountNumber: string; reference?: string }
    | undefined;
  let netTermsDays: number | undefined;
  if (pm === "bank_transfer" || pm === "net_terms") {
    try {
      const { paymentMethods } = await getCheckoutSettings();
      const method = paymentMethods.find((m) => m.id === pm);
      bankDetails = method?.bankDetails;
      netTermsDays = method?.netTermsDays;
    } catch {
      // Fall back to the generic copy below.
    }
  }

  const reference = bankDetails?.reference?.trim() || order;

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
        Please keep a record of your order number.
      </p>

      {/* Payment-specific instructions */}
      {pm === "stripe" && (
        <div className="mt-6 text-left bg-brand-tint border border-brand-light/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-brand-deep">Payment Successful</h3>
          </div>
          <p className="text-sm text-brand-deep">
            Your card payment has been processed successfully.
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
            Please transfer your order total to the account below and use{" "}
            <strong>{reference}</strong> as the payment reference. Your order is processed once
            payment is received.
          </p>
          {bankDetails ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {bankDetails.bankName && (
                <>
                  <dt className="text-accent font-medium">Bank</dt>
                  <dd className="text-accent-dark">{bankDetails.bankName}</dd>
                </>
              )}
              {bankDetails.accountName && (
                <>
                  <dt className="text-accent font-medium">Account Name</dt>
                  <dd className="text-accent-dark">{bankDetails.accountName}</dd>
                </>
              )}
              {bankDetails.bsb && (
                <>
                  <dt className="text-accent font-medium">BSB</dt>
                  <dd className="text-accent-dark">{bankDetails.bsb}</dd>
                </>
              )}
              {bankDetails.accountNumber && (
                <>
                  <dt className="text-accent font-medium">Account No.</dt>
                  <dd className="text-accent-dark">{bankDetails.accountNumber}</dd>
                </>
              )}
              <dt className="text-accent font-medium">Reference</dt>
              <dd className="text-accent-dark">{reference}</dd>
            </dl>
          ) : (
            <p className="text-sm text-accent-dark mt-2">
              Please contact us for our bank account details to complete your payment.
            </p>
          )}
        </div>
      )}

      {pm === "net_terms" && (
        <div className="mt-6 text-left bg-member-bg border border-member/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-member-text" />
            <h3 className="text-sm font-semibold text-member-text">Invoice &amp; Payment Terms</h3>
          </div>
          <p className="text-sm text-member-text">
            An invoice with Net {netTermsDays ?? 30} payment terms will be sent to you. No action
            is required at this time.
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
