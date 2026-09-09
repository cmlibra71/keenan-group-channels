import { publicQuoteUrl } from "@keenan/services";
import { isUnpayableOrderStatus } from "./pay-balance";

/**
 * Where THIS customer's tax invoice PDF lives, and whether we may offer it at all (card EizZjaY3).
 *
 * Steve's complaint on that card is that a paid order's tax invoice existed — it is attached to
 * the confirmation email and named on every screen — and the customer had no way to fetch it
 * again. This is that way: `/account/orders/[id]` renders it as a download.
 *
 * The document itself is rendered by the PORTAL, from the order's rows as they stand right now
 * (`/invoice/document`), because that is where the one invoice recipe lives — the same build the
 * emailed invoice and the paid-order confirmation attach. A storefront copy of that recipe would
 * be a second rendering of an invoice to keep in step, which is exactly what the portal register
 * forbids.
 *
 * Keyed on the ORDER'S UUID, never its id: a Chefs Depot order number is an enumerable sequence
 * and this document is served without a session, so the credential has to be the unguessable one.
 *
 * ── THE HOST IS THIS STOREFRONT'S OWN, NOT THE PARENT GROUP'S ────────────────────────────────
 * `https://quotes.chefsdepot.com.au/invoice/document?o=…` for a Chefs Depot customer, never
 * `keenan-group.com.au`. This is the rule card 87IkgD2H settled for the quote acknowledgement
 * (Tim, 2026-08-19) and card Mgt1FTOM/1xzObOdx settled for the finance application, and it
 * generalises to "the other uuid-keyed portal page" by its own wording — which is precisely what
 * this document is. Chefs Depot and Industry Kitchens are separate businesses (Product Brief
 * section 3) and an address we send a CUSTOMER to is never the other one's; the parent group's
 * root is the STAFF portal. It also matters that the SilverChef sheet on this very invoice already
 * opens on `quotes.<apex>`: two links on one document must not disagree about whose business the
 * customer is dealing with.
 *
 * The host is derived from `publicQuoteUrl` in `@keenan/services` — the same shared and tested
 * rule the acknowledgement, the emailed quote link and the portal's own `buildPublicUrl` use — so
 * the invoice link cannot drift from them. `src/lib/caddy.ts` in the portal proxies the WHOLE
 * portal on `<public_subdomain>.<apex>`, so `/invoice/document` is already served there.
 *
 * `PORTAL_BASE_URL` survives ONLY as the fallback for a channel with no site row to build a host
 * from, the same way the acknowledgement keeps it. It is unset in the deploy workflow, so that
 * fallback is a real page rather than a dead one.
 *
 * Pure: an order with no uuid gets NO link rather than a link to a 404.
 *
 * `invoicePrintUrl` is the SAME address with `&print=1`, which the portal answers with a one-page
 * frame around this very document and the browser's print dialog over it (card uoSUWW3R). Steve
 * asked on the 26 August call to be able to print an invoice without downloading the PDF and
 * reopening it; printing THE document rather than a storefront-rendered copy of it is what keeps
 * the paper a customer holds identical to the paper we email, whichever way they got it.
 */
function originOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).origin;
  } catch {
    return null;
  }
}

/**
 * THE origin every portal-rendered order document is fetched from for this storefront — the host
 * rule above, isolated so it is derived exactly once in this module.
 *
 * `publicQuoteUrl` needs a uuid to build a link, and the origin does not depend on which one, so a
 * placeholder is passed and only the origin kept. Exported because the ARCHIVE endpoint
 * (`invoice-archive.ts`, card WlTnY4cd) needs the same origin: two derivations of "which portal
 * host does this storefront talk to" is exactly the drift `invoicePrintUrl` was written to avoid.
 */
export function invoicePortalOrigin(
  site: { url?: string | null; publicSubdomain?: string | null } | null | undefined
): string {
  // The quote link's host, reused rather than re-derived: one apex/subdomain rule for every
  // customer-facing portal address this storefront hands out.
  const onOwnHost = publicQuoteUrl({
    siteUrl: site?.url,
    publicSubdomain: site?.publicSubdomain,
    uuid: "00000000-0000-0000-0000-000000000000",
  });
  return (
    (onOwnHost ? originOf(onOwnHost) : null) ??
    (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/+$/, "")
  );
}

export function invoiceDocumentUrl(
  orderUuid: string | null | undefined,
  site: { url?: string | null; publicSubdomain?: string | null } | null | undefined
): string | null {
  const uuid = typeof orderUuid === "string" ? orderUuid.trim() : "";
  if (!uuid) return null;
  return `${invoicePortalOrigin(site)}/invoice/document?o=${encodeURIComponent(uuid)}`;
}

/**
 * Where the customer PRINTS that same document (card uoSUWW3R).
 *
 * Deliberately derived from `invoiceDocumentUrl` rather than rebuilt: the host rule (this
 * storefront's own quotes host, never the parent group's — 87IkgD2H) and the no-uuid-no-link rule
 * are decided once, so a Print button can never point somewhere a Download button would not.
 */
export function invoicePrintUrl(
  orderUuid: string | null | undefined,
  site: { url?: string | null; publicSubdomain?: string | null } | null | undefined
): string | null {
  const url = invoiceDocumentUrl(orderUuid, site);
  return url ? `${url}&print=1` : null;
}

/**
 * MAY this order be offered its tax invoice at all?
 *
 * Two refusals, and both are about not handing a customer a piece of paper we would not stand
 * behind:
 *
 * 1. **No live lines.** That is the FIRST thing `buildOrderInvoiceDocument` refuses on ("This
 *    order has no line items"), so the link would answer 404. A Download that 404s is worse than
 *    no Download.
 *
 * 2. **A cancelled, declined or refunded order is not invoiced** — register `sf-account-orders`
 *    (card D045H6Zh: "a cancelled order shows no outstanding figure and is never asked to pay")
 *    and `order-money` (card UKue4u18). The document's closing line reads "Payment is due by
 *    <date>" over an Amount-due band whenever nothing has been paid, so offering it here would put
 *    a payment demand on the one screen that deliberately suppresses every payment ask — 890
 *    Industry Kitchens orders, by that rule's own measurement. `closed` rides with them because
 *    the portal route that renders the document refuses it too, and the page and the server must
 *    agree about what they will serve.
 */
const CLOSED_TO_INVOICING: ReadonlySet<string> = new Set(["closed"]);

export function offersInvoiceDocument(input: {
  status: string | null | undefined;
  hasLiveLines: boolean;
}): boolean {
  if (!input.hasLiveLines) return false;
  if (isUnpayableOrderStatus(input.status)) return false;
  return !CLOSED_TO_INVOICING.has(String(input.status ?? "").trim().toLowerCase());
}
