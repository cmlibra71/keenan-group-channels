import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { quoteService, productImageService, CHANNEL_ID } from "@/lib/store";
import { Price } from "@/components/ui/Price";
import { QuoteActions } from "./quote-actions";

// QuoteService returns snake_case rows (transformRow convention).
interface QuoteDetail {
  id: number;
  uuid: string;
  status: string | null;
  channel_id: number;
  contact_id: number | null;
  quote_number: string | null;
  quote_amount: string | null;
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

const statusLabels: Record<string, string> = {
  quote_pending: "awaiting review",
  quote_available: "quote ready",
  open_change_request: "change requested",
  quote_accepted: "accepted",
  quote_on_hold: "on hold",
  converted_to_order: "ordered",
  quote_expired: "expired",
  quote_cancelled: "cancelled",
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

  const quote = (await quoteService.getWithItems(quoteId)) as QuoteDetail | null;
  // Only the owning contact, on this channel, may view a quote.
  if (!quote || quote.contact_id !== session.contactId || quote.channel_id !== CHANNEL_ID) {
    notFound();
  }

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

  const status = quote.status || "quote_pending";
  // Zoey rule: prices are hidden from the customer while the sales team is
  // still preparing them (quote_pending / open_change_request).
  const hidePrices = quote.hide_prices ?? status === "quote_pending";
  const total = parseFloat(quote.quote_amount || quote.base_amount || "0");

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
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
          {statusLabels[status] || status}
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
          const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;
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
                {!hasPrice && (
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

      {/* Totals */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm font-medium text-text-secondary">Quote Total</span>
        {!hidePrices && total > 0 ? (
          <Price amount={total} className="text-lg font-semibold text-text-primary" />
        ) : (
          <span className="text-sm font-medium text-text-muted">To be quoted</span>
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
      <QuoteActions quoteId={quote.id} status={status} />
    </div>
  );
}
