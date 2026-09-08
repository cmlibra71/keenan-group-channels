import { Download } from "lucide-react";
import {
  INVOICE_ARCHIVE_PATH,
  archivePanelWording,
  selectArchiveInvoices,
  type ArchiveCandidate,
} from "@/lib/orders/invoice-archive";

/**
 * "Your tax invoices" on `/account/orders` — the one place a customer downloads the lot
 * (card WlTnY4cd).
 *
 * EizZjaY3 put a customer's tax invoice one click from the order it belongs to; this is the other
 * half of that ask, for the customer who wants every invoice at once — for their bookkeeper, or at
 * BAS time — rather than opening thirty orders and saving thirty PDFs by hand.
 *
 * ── WHY IT IS A PANEL ABOVE THE LIST AND NOT A LINK INSIDE EACH ORDER CARD ───────────────────
 * Because the order card on this page is a single `<a>` wrapping its whole contents, deliberately
 * (card D045H6Zh, register `sf-account-orders`): the order number alone was a small target inside
 * something that looks entirely clickable, and the screenshot on that card is a customer meeting
 * exactly that. An anchor cannot legally contain another anchor, so a per-order Download inside a
 * card would mean breaking that card open and undoing D045H6Zh's fix. The per-order download
 * already exists one click away, on the order's own page, where the document is also NAMED — a
 * pro-forma or a paid receipt — and this panel is the "all of them" the card asks for. Nothing in
 * either place duplicates the other.
 *
 * It renders NOTHING when the customer has no invoice we would stand behind, rather than a button
 * that downloads an empty file: `archivePanelWording` returns null and this returns null with it.
 * The count is stated because a customer pressing a download-everything button is entitled to know
 * what "everything" is before they press it, and a capped history says so in plain words.
 *
 * Styled on the shared token contract (`border-border`, `text-text-*`, `bg-white`) — the same
 * tokens the order cards under it use — so it does not read as a bolted-on widget on either
 * storefront. A plain link, so it works with no JavaScript, and the archive itself streams from
 * `/account/invoices/download`, which is where the ownership check lives.
 */
export function InvoiceArchivePanel({ orders }: { orders: readonly ArchiveCandidate[] }) {
  const wording = archivePanelWording(selectArchiveInvoices(orders));
  if (!wording) return null;

  return (
    <div className="mb-6 rounded-card border border-border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-text-primary">{wording.heading}</h2>
          <p className="mt-1 text-sm text-text-secondary">{wording.body}</p>
        </div>
        <a
          href={INVOICE_ARCHIVE_PATH}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
        >
          <Download className="h-4 w-4" />
          {wording.button}
        </a>
      </div>
    </div>
  );
}
