import Link from "next/link";
import { CheckCircle, Building2, FileText, CreditCard } from "lucide-react";
import { getCheckoutSettings, orderService, orderItemService } from "@/lib/store";
import { Ga4Purchase, type Ga4PurchaseProps } from "@/components/analytics/Ga4Purchase";
import { ConfirmationRedirect } from "@/components/checkout/ConfirmationRedirect";
import { canViewOrderConfirmation } from "@/lib/checkout/confirmation-access";
import { isFinancePaymentMethod } from "@/lib/checkout/finance";
import type { Ga4Item } from "@/components/analytics/ga4";

export const metadata = {
  title: "Order Confirmed",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; pm?: string }>;
}) {
  const { order, pm } = await searchParams;

  // Never render someone else's order. The number arrives straight from the
  // URL, so it is only ours to show if this visitor owns it (signed in) or
  // just placed it (the guest breadcrumb cookie). Unverified visitors still
  // get the confirmation page — just none of the order's data.
  const mayView = order ? await canViewOrderConfirmation(order) : false;
  const orderRef = mayView ? order : undefined;

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
  // Net Terms is account-specific — prefer the actual term length stamped on the
  // order at checkout over the flat channel default.
  if (pm === "net_terms" && orderRef) {
    try {
      const res = await orderService.list({
        page: 1, limit: 1, sort: "id", direction: "desc",
        filters: { order_number: { type: "eq", value: orderRef } },
      });
      const stored = (res.data[0] as { metafields?: { net_terms_days?: number } } | undefined)?.metafields?.net_terms_days;
      if (typeof stored === "number") netTermsDays = stored;
    } catch {
      // keep the channel-default fallback
    }
  }

  const reference = bankDetails?.reference?.trim() || orderRef;

  // Build the GA4 client-side purchase from the order header. This client event
  // is the sole purchase source — GA4 does NOT dedupe by transaction_id, so the
  // channel must keep the worker server-side MP purchase OFF or it double-counts.
  let ga4Purchase: Ga4PurchaseProps | null = null;
  if (orderRef) {
    try {
      const res = await orderService.list({
        page: 1, limit: 1, sort: "id", direction: "desc",
        filters: { order_number: { type: "eq", value: orderRef } },
      });
      const o = res.data[0] as Record<string, unknown> | undefined;
      if (o) {
        const num = (v: unknown) => {
          const n = parseFloat(String(v ?? ""));
          return Number.isFinite(n) ? n : 0;
        };
        // list() returns the order header only (no line items), so fetch them
        // explicitly — otherwise the client purchase ships with an empty items
        // array. Relying on ga4_sync alone is fragile: a still-pending order
        // (webhook in flight) is skipped server-side, leaving GA4 with a
        // product-less purchase.
        let rawItems: Record<string, unknown>[] = [];
        try {
          const itemRes = await orderItemService.listForParent(Number(o.id), {
            page: 1,
            limit: 200,
            sort: "id",
            direction: "asc",
          });
          rawItems = (itemRes.data ?? []) as Record<string, unknown>[];
        } catch {
          // header-only fallback; ga4_sync still records the authoritative purchase
        }
        const items: Ga4Item[] = rawItems.map((it, index) => ({
          item_id: String(it.sku ?? it.product_id ?? `item-${index}`),
          item_name: String(it.name ?? "(unnamed)"),
          price: num(it.price_inc_tax ?? it.price),
          quantity: num(it.quantity) || 1,
          index,
        }));
        ga4Purchase = {
          transactionId: String(o.order_number ?? orderRef),
          value: num(o.total_inc_tax),
          tax: num(o.total_tax),
          shipping: num(o.shipping_cost_inc_tax),
          currency: String(o.currency_code ?? "AUD"),
          items,
        };
      }
    } catch {
      // Non-fatal — the server-side ga4_sync still records the purchase.
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-16 text-center">
      {ga4Purchase && <Ga4Purchase {...ga4Purchase} />}
      <CheckCircle className="h-16 w-16 text-brand mx-auto" />

      <h1 className="page-title mt-6">Order Confirmed</h1>

      <p className="mt-4 text-steel-500">
        Thank you for your order! Your order number is:
      </p>

      {order && (
        <p className="mt-2 text-xl font-semibold text-ink-900">{orderRef}</p>
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

      {/* SilverChef / Finance (card VAjaPj0t). The order is placed and NOTHING
          has been charged — this is the on-site "we've got your application"
          the customer sees instead of a second email. */}
      {isFinancePaymentMethod(pm ?? "") && (
        <div className="mt-6 text-left bg-accent-subtle border border-accent/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-accent-dark">
              {pm === "silverchef" ? "SilverChef application received" : "Finance application received"}
            </h3>
          </div>
          <p className="text-sm text-accent-dark">
            Your application has been sent to our team and nothing has been charged. We&apos;ll be
            in touch about your finance — your order is held against{" "}
            <strong>{orderRef ?? "your order number"}</strong> until it is settled.
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

      {/* Hold the thank-you for a few seconds, then move the shopper on rather
          than leaving them on a dead-end page they can only Back out of. */}
      <ConfirmationRedirect to="/" seconds={15} />
    </div>
  );
}
