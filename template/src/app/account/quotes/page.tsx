import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { quoteService, CHANNEL_ID } from "@/lib/store";
import { getQuoteUuid } from "@/lib/quote";
import { Price } from "@/components/ui/Price";

// QuoteService returns snake_case rows (transformRow convention).
interface QuoteRecord {
  id: number;
  uuid: string;
  status: string | null;
  customer_id: number | null;
  quote_number: string | null;
  quote_amount: string | null;
  attributes: Record<string, unknown> | null;
  created_at: Date | string | null;
}

interface QuoteItemRecord {
  id: number;
  product_name: string;
  quantity: number;
}

interface QuoteWithItems extends QuoteRecord {
  items: QuoteItemRecord[];
}

// Zoey-aligned lifecycle statuses (QuoteService QUOTE_STATUSES).
const statusStyles: Record<string, string> = {
  quote_pending: "bg-yellow-100 text-yellow-700",
  quote_available: "bg-blue-100 text-blue-700",
  open_change_request: "bg-blue-100 text-blue-700",
  quote_accepted: "bg-green-100 text-green-700",
  quote_on_hold: "bg-zinc-100 text-zinc-600",
  converted_to_order: "bg-green-100 text-green-700",
  quote_expired: "bg-zinc-100 text-zinc-600",
  quote_cancelled: "bg-red-100 text-red-700",
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
  title: "My Quotes",
};

export default async function QuotesPage() {
  const session = await getSession();
  if (!session) redirect("/account");

  // listForCustomer hides quote_pending entirely, but a SUBMITTED request is
  // also quote_pending (Zoey lifecycle) — the customer should still see it as
  // "awaiting review". Fetch all of the customer's quotes and hide only the
  // in-progress draft (the one the quote panel cookie points at).
  const currentDraftUuid = await getQuoteUuid();
  const result = await quoteService.list({
    page: 1,
    limit: 100,
    sort: "created_at",
    direction: "desc",
    filters: {
      customer_id: { type: "eq", value: session.customerId },
      channel_id: { type: "eq", value: CHANNEL_ID },
    },
  });
  const customerQuotes = (result.data as unknown as QuoteRecord[]).filter(
    (q) =>
      q.status !== "quote_pending" ||
      Boolean(q.attributes?.submitted_at) ||
      q.uuid !== currentDraftUuid
  );

  if (customerQuotes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Quotes</h1>
        <div className="text-center py-16">
          <FileText className="h-16 w-16 text-zinc-300 mx-auto" />
          <p className="mt-4 text-zinc-500">No quotes yet.</p>
          <Link
            href="/products"
            className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  const quotesWithItems = await Promise.all(
    customerQuotes.map(async (quote) => {
      const result = await quoteService.getWithItems(quote.id) as QuoteWithItems | null;
      return result || { ...quote, items: [] };
    })
  );

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">My Quotes</h1>
        <Link href="/account" className="text-sm text-zinc-500 hover:text-zinc-900">
          Back to Account
        </Link>
      </div>

      <div className="space-y-4">
        {quotesWithItems.map((quote) => {
          const itemsList = quote.items || [];
          const totalItems = itemsList.reduce((sum, i) => sum + i.quantity, 0);
          const itemNames = itemsList
            .slice(0, 3)
            .map((i) => i.product_name)
            .join(", ");
          const status = quote.status || "quote_pending";

          return (
            <Link key={quote.id} href={`/account/quotes/${quote.id}`} className="block border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-zinc-900">
                    Quote #{quote.quote_number || quote.id}
                  </span>
                  <span className="ml-3 text-sm text-zinc-500">
                    {quote.created_at ? new Date(quote.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    statusStyles[status] || "bg-zinc-100 text-zinc-600"
                  }`}>
                    {statusLabels[status] || status}
                  </span>
                  {parseFloat(quote.quote_amount || "0") > 0 ? (
                    <Price amount={quote.quote_amount || "0"} className="font-semibold text-zinc-900" />
                  ) : (
                    <span className="text-sm font-medium text-zinc-500">To be quoted</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-500">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
                {itemNames ? `: ${itemNames}` : ""}
                {itemsList.length > 3 ? "..." : ""}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700">
                View quote
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
