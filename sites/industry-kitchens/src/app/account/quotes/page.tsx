import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import { quoteService, CHANNEL_ID } from "@/lib/store";
import { getQuoteUuid } from "@/lib/quote";
import { Price } from "@/components/ui/Price";
import {
  quoteHidesPrices,
  redactQuotePrices,
  resolveQuoteTotal,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { quoteStatusLabel } from "@/lib/quotes/quote-status-label";

// QuoteService returns snake_case rows (transformRow convention).
interface QuoteRecord {
  id: number;
  uuid: string;
  status: string | null;
  hide_prices: boolean | null;
  contact_id: number | null;
  quote_number: string | null;
  quote_amount: string | null;
  attributes: Record<string, unknown> | null;
  created_at: Date | string | null;
}

interface QuoteItemRecord {
  id: number;
  product_name: string;
  quantity: number;
  // getWithItems returns the priced row; these are declared so the total can tell a
  // genuine $0 quote from a stale zero header (see resolveQuoteTotal).
  sale_price?: string | null;
  list_price?: string | null;
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

  // B2B account-role gate `view_company_quotes` (docs/crm-parity/10-role-enforcement.md):
  // granted → every quote on the account; otherwise own-only. Accountless (B2C)
  // contacts are unaffected. A failed member lookup degrades to own-only.
  const perms = await getContactPermissions(session.contactId);
  const seesWholeAccount = perms.isB2B && perms.accountId !== null && perms.can("view_company_quotes");
  const memberIds = seesWholeAccount ? await getAccountContactIds(perms.accountId!) : [];
  const contactFilter =
    memberIds.length > 0
      ? { type: "in" as const, value: memberIds }
      : { type: "eq" as const, value: session.contactId };

  const result = await quoteService.list({
    page: 1,
    limit: 100,
    sort: "created_at",
    direction: "desc",
    filters: {
      contact_id: contactFilter,
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

  const hideStatuses = await getHidePriceStatuses();
  const quotesWithItems = await Promise.all(
    customerQuotes.map(async (quote) => {
      const result = (await quoteService.getWithItems(quote.id)) as QuoteWithItems | null;
      const row = result || { ...quote, items: [] };
      // Redact server-side rather than rendering around the number, so a hidden
      // amount never ships in the page source.
      return quoteHidesPrices(row, hideStatuses)
        ? { ...redactQuotePrices(row), hidden_prices: true }
        : { ...row, hidden_prices: false };
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
                    {quoteStatusLabel(status)}
                  </span>
                  {/* Show the amount whenever prices are visible — including $0.00.
                      "To be quoted" means "not priced yet", not "zero". */}
                  {!quote.hidden_prices && resolveQuoteTotal(quote) !== null ? (
                    <Price amount={resolveQuoteTotal(quote)!} className="font-semibold text-zinc-900" />
                  ) : (
                    <span className="text-sm font-medium text-zinc-500">To be quoted</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-500">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
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
