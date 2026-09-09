import { getSession } from "@/lib/auth";
import { getSiteConfig } from "@/lib/store";
import { signInRedirect } from "@/lib/account-redirect";
import { loadArchiveOrders } from "@/lib/orders/invoice-archive-data";
import { invoiceArchiveEndpoint, selectArchiveInvoices } from "@/lib/orders/invoice-archive";

/**
 * `GET /account/invoices/download` — every tax invoice this signed-in customer holds, as one zip
 * (card WlTnY4cd).
 *
 * ── WHY THE DOWNLOAD COMES THROUGH THE STOREFRONT ────────────────────────────────────────────
 * The documents are rendered by the PORTAL (one invoice recipe, `buildOrderInvoiceDocument` — a
 * storefront copy of it would be a second rendering of an invoice to keep in step, which the
 * register forbids). But the portal's document routes are keyed on `orders.uuid` with no session,
 * and that is a fine credential for ONE document somebody was handed a link to and no way at all
 * to decide whose invoices these are.
 *
 * So the link on `/account/orders` points HERE, at a path on this storefront, which means the
 * request carries the customer's session cookie. This route resolves whose orders they are
 * (`loadArchiveOrders`, using the same three routes into an order the order list and the order
 * page enforce), applies the same offered-or-not rule the per-order Download button applies
 * (`selectArchiveInvoices` → `offersInvoiceDocument`), and only then asks the portal for exactly
 * those uuids. The customer never sees a uuid and nothing is decided from the URL.
 *
 * The alternative — putting fifty uuids in a link on the page — was rejected for two reasons: the
 * list would be a page-render-time snapshot that goes stale, and a shared or bookmarked link would
 * carry the credentials for fifty documents in its query string.
 *
 * ── LIMITS ───────────────────────────────────────────────────────────────────────────────────
 * Rate-limited per CONTACT, in this process, because this is the only layer that knows who is
 * asking: every storefront request reaches the portal from the same server address, so a per-IP
 * limit there cannot tell two customers apart. Six archives an hour is far beyond any real use of
 * a download-everything button and well short of a way to make the portal render PDFs all day.
 *
 * The stream is piped straight through: the portal writes the archive entry by entry as each PDF
 * renders, so the customer's browser starts receiving bytes on the first document rather than
 * after the fiftieth.
 */

export const dynamic = "force-dynamic";

/** Per-contact, per-hour. Deliberately small: one press of one button is a whole archive. */
const MAX_ARCHIVES_PER_HOUR = 6;
const WINDOW_MS = 60 * 60 * 1000;

const recentByContact = new Map<number, number[]>();

function withinRateLimit(contactId: number): boolean {
  const now = Date.now();
  const recent = (recentByContact.get(contactId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_ARCHIVES_PER_HOUR) {
    recentByContact.set(contactId, recent);
    return false;
  }
  recent.push(now);
  recentByContact.set(contactId, recent);
  // The map is per-process and unbounded otherwise; a signed-in customer who stops pressing the
  // button should not keep a row forever.
  if (recentByContact.size > 5000) {
    for (const [key, times] of recentByContact) {
      if (times.every((at) => now - at >= WINDOW_MS)) recentByContact.delete(key);
    }
  }
  return true;
}

export async function GET(): Promise<Response> {
  const session = await getSession();
  // No session, no archive — and no hint about what would have been in it. A signed-out visitor is
  // sent to sign in rather than told "no invoices", because the two are different facts.
  if (!session) {
    return new Response(null, {
      status: 302,
      headers: { Location: signInRedirect("/account/orders"), "Cache-Control": "no-store" },
    });
  }

  if (!withinRateLimit(session.contactId)) {
    return new Response("Too many requests. Please try again shortly.", {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const [orders, siteConfig] = await Promise.all([
    loadArchiveOrders(session),
    getSiteConfig().catch(() => ({ site: null })),
  ]);
  const selection = selectArchiveInvoices(orders);
  // Nothing to archive is a plain answer, not an empty zip: an empty archive downloads, opens and
  // says nothing, which is worse than being told there is nothing to download. The panel that
  // links here is absent in this case, so this is the belt to its braces.
  if (selection.uuids.length === 0) {
    return new Response("No tax invoices are available to download.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(invoiceArchiveEndpoint(siteConfig.site), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ o: selection.uuids }),
      cache: "no-store",
    });
  } catch {
    return new Response("Your invoices could not be prepared just now. Please try again shortly.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Your invoices could not be prepared just now. Please try again shortly.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="tax-invoices.zip"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
