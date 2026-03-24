import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { quoteService, CHANNEL_ID } from "@/lib/store";
import { Price } from "@/components/ui/Price";

interface QuoteRecord {
  id: number;
  status: string | null;
  quoteAmount: string | null;
  createdAt: Date | null;
}

interface QuoteItemRecord {
  id: number;
  productName: string;
  quantity: number;
}

interface QuoteWithItems extends QuoteRecord {
  items: QuoteItemRecord[];
}

const statusStyles: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-700",
  reviewed: "bg-blue-100 text-blue-700",
  accepted: "text-accent bg-accent-subtle",
  rejected: "bg-red-100 text-red-700",
  converted: "text-accent bg-accent-subtle",
  expired: "bg-surface-secondary text-text-secondary",
};

export const metadata = {
  title: "My Quotes",
};

export default async function QuotesPage() {
  const session = await getSession();
  if (!session) redirect("/account");

  const customerQuotes = await quoteService.listForCustomer(
    session.customerId,
    CHANNEL_ID
  ) as QuoteRecord[];

  if (customerQuotes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
        <p className="eyebrow mb-3">QUOTES</p>
        <h1 className="text-3xl heading-serif text-text-primary mb-8">My Quotes</h1>
        <div className="text-center section-padding">
          <FileText className="h-16 w-16 text-text-muted mx-auto" />
          <p className="mt-4 text-text-secondary">No quotes yet.</p>
          <Link
            href="/products"
            className="mt-6 inline-block btn-primary"
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
    <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-3">QUOTES</p>
          <h1 className="text-3xl heading-serif text-text-primary">My Quotes</h1>
        </div>
        <Link href="/account" className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-300">
          Back to Account
        </Link>
      </div>

      <div className="space-y-4">
        {quotesWithItems.map((quote) => {
          const itemsList = quote.items || [];
          const totalItems = itemsList.reduce((sum, i) => sum + i.quantity, 0);
          const itemNames = itemsList
            .slice(0, 3)
            .map((i) => i.productName)
            .join(", ");
          const status = quote.status || "submitted";

          return (
            <div key={quote.id} className="card-padded">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-text-primary">
                    Quote #{quote.id}
                  </span>
                  <span className="ml-3 text-sm text-text-secondary">
                    {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    statusStyles[status] || "bg-surface-secondary text-text-secondary"
                  }`}>
                    {status}
                  </span>
                  <Price amount={quote.quoteAmount || "0"} className="font-semibold text-text-primary" />
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
                {itemNames ? `: ${itemNames}` : ""}
                {itemsList.length > 3 ? "..." : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
