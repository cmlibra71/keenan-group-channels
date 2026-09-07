import { invoicePortalOrigin } from "./invoice-document-url";
import { offersInvoiceDocument } from "./invoice-document-url";

/**
 * "Download all my tax invoices" — the pure half (card WlTnY4cd).
 *
 * Steve's ask on that card is the other end of EizZjaY3: that card put a customer's tax invoice one
 * click from the order it belongs to, and this one is for the customer who wants the lot — for
 * their bookkeeper, or at BAS time — without opening thirty orders and saving thirty PDFs by hand.
 *
 * Everything here is a decision, not a fetch: which of a customer's orders may be invoiced at all,
 * how many one archive carries, and what the panel on `/account/orders` says about it. The reads
 * live in `invoice-archive-data.ts` and the session gate in the download route, so all three can
 * be unit-tested apart from a database.
 */

/**
 * The most invoices one archive carries.
 *
 * Production, 2026-09-05: the busiest single customer holds 112 orders and the busiest ACCOUNT
 * 130, but the 95th percentile is 4 on Industry Kitchens and 8 on Chefs Depot and the MEDIAN is 1.
 * Fifty is therefore "all of them" for every customer we have bar a literal handful, while
 * bounding the work one click can ask for — each invoice is a PDF rendered fresh by the portal.
 *
 * It is a stated limit, never a silent truncation: where a customer has more, the panel says how
 * many the archive will hold and which they are (the most recent), and the per-order Download on
 * each order page still reaches every one of the rest. The number must stay in step with
 * `MAX_BULK_INVOICES` in the portal's `/invoice/documents` route, which enforces the same cap
 * server-side.
 */
export const MAX_ARCHIVE_INVOICES = 50;

/** Where the storefront asks the portal for the archive. Server-to-server, from the download
 *  route — never an address handed to a browser. Derived from the SAME origin rule as the
 *  per-order download so there is one host derivation in this module rather than two. */
export function invoiceArchiveEndpoint(
  site: { url?: string | null; publicSubdomain?: string | null } | null | undefined
): string {
  return `${invoicePortalOrigin(site)}/invoice/documents`;
}

/** What the storefront's own download link is called. A path, so it is same-origin and carries the
 *  customer's session cookie — the ownership check is the whole point of routing through here. */
export const INVOICE_ARCHIVE_PATH = "/account/invoices/download";

export interface ArchiveCandidate {
  /** `orders.uuid` — the credential the portal's document route is keyed on. Never the id. */
  uuid: string | null;
  status: string | null;
  hasLiveLines: boolean;
}

export interface ArchiveSelection {
  /** The uuids to ask the portal for, newest first, capped. */
  uuids: string[];
  /** How many of the customer's orders can be invoiced at all. */
  available: number;
  /** True when `available` exceeds the cap, so the panel must say what the archive holds. */
  capped: boolean;
}

/**
 * Which of these orders may be put in the archive, in the order they were given (newest first).
 *
 * The refusals are NOT re-stated here: `offersInvoiceDocument` is the one tested predicate that
 * already decides whether an order is offered its tax invoice at all — no live lines, or a
 * cancelled / declined / refunded / closed order, which is never invoiced and whose document
 * closes with a payment demand (card D045H6Zh, register `sf-account-orders`). The per-order
 * Download button on the order page asks that same function, so the archive can never contain a
 * document that page withholds, nor withhold one it offers.
 *
 * An order with no uuid is dropped for the same reason the per-order link is: no credential, no
 * document, and a link to a 404 is worse than no link.
 */
export function selectArchiveInvoices(
  orders: readonly ArchiveCandidate[],
  cap: number = MAX_ARCHIVE_INVOICES
): ArchiveSelection {
  const eligible = orders.filter(
    (order) =>
      typeof order.uuid === "string" &&
      order.uuid.trim().length > 0 &&
      offersInvoiceDocument({ status: order.status, hasLiveLines: order.hasLiveLines })
  );
  return {
    uuids: eligible.slice(0, Math.max(0, cap)).map((order) => (order.uuid as string).trim()),
    available: eligible.length,
    capped: eligible.length > cap,
  };
}

/**
 * What the panel says.
 *
 * Plain, countable and honest: the customer is told how many documents they are about to get, and
 * — where their history is longer than one archive — that these are the most recent and where the
 * older ones still are. No invoices means no panel at all, which is why this answers null: a
 * "Download 0 invoices" button is a control that does nothing, and the register's canonical
 * mistake on these screens is a control with nothing to explain it.
 */
export function archivePanelWording(selection: ArchiveSelection): {
  count: number;
  heading: string;
  body: string;
  button: string;
} | null {
  if (selection.uuids.length === 0) return null;
  const count = selection.uuids.length;
  const noun = count === 1 ? "tax invoice" : "tax invoices";
  return {
    count,
    heading: "Your tax invoices",
    body: selection.capped
      ? `Download your ${count} most recent ${noun} as one zip file. You have ${selection.available} in total — open any older order to download its invoice on its own.`
      : `Download ${count === 1 ? "your" : `all ${count} of your`} ${noun} as one zip file.`,
    button: count === 1 ? "Download invoice (.zip)" : `Download all ${count} invoices (.zip)`,
  };
}
