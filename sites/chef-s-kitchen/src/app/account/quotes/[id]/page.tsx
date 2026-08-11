import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import { quoteService, productImageService, CHANNEL_ID } from "@/lib/store";
import { Price } from "@/components/ui/Price";
import { QuoteActions } from "./quote-actions";
import { AccountShell } from "@/components/account/AccountShell";
import {
  quoteHidesPrices,
  redactQuotePrices,
  resolveQuoteAcceptState,
  resolveQuoteTotal,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { quoteGstTotals, isMoneyRow } from "@/lib/quotes/quote-gst";
import { resolveQuoteGstRate } from "@/lib/quotes/quote-gst-rate";
import { quoteStatusLabel } from "@/lib/quotes/quote-status-label";

// QuoteService returns snake_case rows (transformRow convention).
interface QuoteDetail {
  id: number;
  uuid: string;
  status: string | null;
  channel_id: number;
  contact_id: number | null;
  quote_number: string | null;
  quote_amount: string | null;
  // Basis of the stored total (a Zoey-ingested total already includes GST) plus
  // every component that reconciles to it — see quoteGstTotals.
  tax_inclusive: boolean | null;
  external_source: string | null;
  tax_class_id: number | null;
  discount_amount: string | null;
  coupon_discount: string | null;
  gift_certificate_amount: string | null;
  store_credit_amount: string | null;
  shipping_cost: string | null;
  base_amount: string | null;
  customer_notes: string | null;
  hide_prices: boolean | null;
  expires_at: Date | string | null;
  created_at: Date | string | null;
  items: QuoteDetailItem[];
}

interface QuoteDetailItem {
  id: number;
  product_id: number;
  quantity: number;
  list_price: string | null;
  sale_price: string | null;
  product_name: string;
  product_slug: string | null;
  product_sku: string | null;
  variant_sku: string | null;
  variant_option_name: string | null;
}

const statusStyles: Record<string, string> = {
  quote_pending: "bg-warning-bg text-warning",
  quote_available: "bg-accent-subtle text-accent-dark",
  open_change_request: "bg-accent-subtle text-accent-dark",
  quote_accepted: "text-accent bg-accent-subtle",
  quote_on_hold: "bg-surface-secondary text-text-secondary",
  converted_to_order: "text-accent bg-accent-subtle",
  quote_expired: "bg-surface-secondary text-text-secondary",
  quote_cancelled: "bg-sale-bg text-sale-deep",
};


export const metadata = {
  title: "Quote",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/account");

  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (Number.isNaN(quoteId)) notFound();

  const raw = (await quoteService.getWithItems(quoteId)) as QuoteDetail | null;
  // Only the owning contact, on this channel, may view a quote.
  // Only the owning contact, on this channel, may view a quote — UNLESS their B2B
  // account role grants `view_company_quotes`, in which case any quote belonging to
  // an active member of their account is visible (docs/crm-parity/10-role-enforcement.md).
  if (!raw || raw.channel_id !== CHANNEL_ID) notFound();
  if (raw.contact_id !== session.contactId) {
    const perms = await getContactPermissions(session.contactId);
    const canSeeAccountQuotes =
      perms.isB2B && perms.accountId !== null && perms.can("view_company_quotes");
    const memberIds = canSeeAccountQuotes ? await getAccountContactIds(perms.accountId!) : [];
    if (!raw.contact_id || !memberIds.includes(raw.contact_id)) notFound();
  }

  const status = raw.status || "quote_pending";
  // Price visibility is the quote's own hide_prices value, falling back to the
  // portal-configured price-hiding statuses only when that column is null.
  const hidePrices = quoteHidesPrices(raw, await getHidePriceStatuses());
  // Strip the numbers server-side when they're hidden: rendering around them still
  // ships the raw prices in the page source / RSC payload.
  const quote = hidePrices ? redactQuotePrices(raw) : raw;
  const acceptState = resolveQuoteAcceptState({
    status,
    hidesPrices: hidePrices,
    expires_at: raw.expires_at,
  });

  // Item thumbnails (quote items don't carry images themselves).
  const productIds = [...new Set(quote.items.map((i) => i.product_id))];
  const thumbs = (await productImageService.getThumbnailsForProducts(productIds)) as {
    product_id: number;
    url_thumbnail: string | null;
    url_standard: string | null;
  }[];
  const thumbByProduct = new Map(
    thumbs.map((t) => [t.product_id, t.url_thumbnail || t.url_standard])
  );

  // Show the real total whenever prices are visible — including $0.00 — but not a
  // stale zero on a quote whose lines carry money. See resolveQuoteTotal.
  const total = resolveQuoteTotal(quote);
  // The quote total is the amount payable, so GST is broken out rather than left
  // implicit — the same split the cart summary and the emailed quote show, at the
  // same per-quote rate the portal resolves.
  const gst = quoteGstTotals(total ?? 0, quote, await resolveQuoteGstRate(raw.tax_class_id));

  return (
    <AccountShell>
      <Link
        href="/account/quotes"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to My Quotes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="page-title">
          Quote #{quote.quote_number || quote.id}
        </h1>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            statusStyles[status] || "bg-surface-secondary text-text-secondary"
          }`}
        >
          {quoteStatusLabel(status)}
        </span>
      </div>
      <p className="text-sm text-text-muted mb-8">
        {quote.created_at ? `Requested ${new Date(quote.created_at).toLocaleDateString()}` : ""}
        {quote.expires_at ? ` · Valid until ${new Date(quote.expires_at).toLocaleDateString()}` : ""}
      </p>

      {hidePrices && (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
          Our sales team is preparing pricing for this quote. We&apos;ll let you
          know as soon as it&apos;s ready.
        </div>
      )}

      {/* Items */}
      <div className="border border-border divide-y divide-border">
        {quote.items.map((item) => {
          const unitPrice = item.sale_price
            ? parseFloat(item.sale_price)
            : parseFloat(item.list_price ?? "");
          // $0.00 IS a price — a line someone deliberately zeroed reads like every
          // other line. Only a missing/unparsable number counts as "no price".
          const hasPrice = Number.isFinite(unitPrice);
          return (
            <div key={item.id} className="p-4 flex items-center gap-4">
              <div className="relative h-16 w-16 flex-shrink-0 border border-border bg-white overflow-hidden">
                {thumbByProduct.get(item.product_id) ? (
                  <Image
                    src={thumbByProduct.get(item.product_id)!}
                    alt={item.product_name}
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-text-muted">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={item.product_slug ? `/products/${item.product_slug}` : "#"}
                  className="text-sm font-medium text-text-primary hover:underline block"
                >
                  {item.product_name}
                </a>
                {item.variant_option_name && (
                  <p className="text-xs text-text-secondary mt-0.5">{item.variant_option_name}</p>
                )}
                <p className="text-xs text-text-muted mt-0.5">
                  SKU: {item.variant_sku || item.product_sku || "N/A"}
                </p>
                <p className="text-sm text-text-secondary mt-1">
                  Qty {item.quantity}
                  {!hidePrices && hasPrice && (
                    <>
                      {" · "}
                      <Price amount={unitPrice} /> each
                    </>
                  )}
                </p>
                {/* "Requires quote" is reserved for a quote whose pricing hasn't
                    been prepared yet — never for a priced line that happens to
                    come to $0.00. */}
                {hidePrices && (
                  <span className="mt-1 inline-block bg-member-bg text-member-text border border-member/40 px-2 py-0.5 rounded text-xs font-medium">
                    Requires quote
                  </span>
                )}
              </div>
              {!hidePrices && hasPrice && (
                <div className="text-right">
                  <Price
                    amount={unitPrice * item.quantity}
                    className="text-sm font-semibold text-text-primary"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals — GST shown, because the quote total is what the customer pays.
          Every non-zero component is printed, so Subtotal … Total is arithmetic the
          customer can follow — including the freight Zoey folds into its grand total
          with no shipping_cost of its own. */}
      <div className="mt-4 border-t border-border pt-4">
        {!hidePrices && total !== null ? (
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Subtotal (ex GST)</dt>
              <dd><Price amount={gst.subtotalEx} className="text-text-primary" /></dd>
            </div>
            {(
              [
                ["Discount", gst.discountEx],
                ["Coupon", gst.couponEx],
                ["Gift certificate", gst.giftEx],
                ["Store credit", gst.creditEx],
              ] as const
            )
              .filter(([, amount]) => isMoneyRow(amount))
              .map(([label, amount]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd className="text-text-primary">
                    −<Price amount={amount} className="text-text-primary" />
                  </dd>
                </div>
              ))}
            {isMoneyRow(gst.freightEx) && (
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">Freight (ex GST)</dt>
                <dd><Price amount={gst.freightEx} className="text-text-primary" /></dd>
              </div>
            )}
            {isMoneyRow(gst.adjustmentEx) && (
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">Adjustment</dt>
                <dd><Price amount={gst.adjustmentEx} className="text-text-primary" /></dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">GST</dt>
              <dd><Price amount={gst.tax} className="text-text-primary" /></dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1">
              <dt className="font-medium text-text-secondary">Quote Total (inc GST)</dt>
              <dd><Price amount={gst.incTax} className="text-lg font-semibold text-text-primary" /></dd>
            </div>
          </dl>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Quote Total</span>
            <span className="text-sm font-medium text-text-muted">To be quoted</span>
          </div>
        )}
      </div>

      {/* Customer notes */}
      {quote.customer_notes && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Your notes</h2>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{quote.customer_notes}</p>
        </div>
      )}

      {/* Customer self-service actions */}
      <QuoteActions quoteId={quote.id} status={status} acceptState={acceptState} />
    </AccountShell>
  );
}
