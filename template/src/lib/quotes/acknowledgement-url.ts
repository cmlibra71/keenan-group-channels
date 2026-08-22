import { publicQuoteUrl } from "@keenan/services";

/**
 * Where a customer who has just accepted a quote in the account area is SENT
 * (card 87IkgD2H, Tim 2026-08-19).
 *
 * The acknowledgement page is the PORTAL's — one page serves both acceptance
 * paths, because it carries the SilverChef offer and that figure is computed
 * once, in the portal's shared finance module, which this repo cannot reach.
 *
 * **But it is served on THIS storefront's own quotes host, not the parent
 * group's.** The portal serves `/q/*` on every channel's `quotes.<apex>` host —
 * Caddy routes each channel's `public_subdomain` to the portal — and that is the
 * host the EMAILED quote link already uses. So a Chefs Depot customer accepting
 * inside chefsdepot.com.au stays on quotes.chefsdepot.com.au, exactly as one
 * accepting from their inbox does.
 *
 * The first cut of this card hardcoded `PORTAL_BASE_URL || keenan-group.com.au`
 * and threw that customer to the PARENT GROUP's domain — whose root is the staff
 * portal — then back ten seconds later. Chefs Depot and Industry Kitchens are
 * separate businesses (Product Brief section 3) and an address we send a CUSTOMER
 * to is never the other one's.
 *
 * The host is built by `publicQuoteUrl` in `@keenan/services`, the same shared and
 * tested rule the portal's `buildPublicUrl` and the nightly reminder pass use, so
 * the two acceptance paths cannot drift apart from each other or from the email.
 *
 * `PORTAL_BASE_URL` survives only as the fallback for a channel with no site row
 * to build a host from. It is unset in the deploy workflow, so that fallback is
 * `https://keenan-group.com.au` — a real page rather than a dead one. The same
 * variable targets the server-to-server acceptance follow-up POST, so pointing it
 * at a container-internal host to make that call cheaper turns the fallback into
 * a dead link; split the two if that is ever wanted.
 *
 * Null for a quote carrying no uuid. Nothing in production has one, but the column
 * is nullable and a missing acknowledgement must degrade to "stay here and
 * refresh", never to a broken link.
 */
export function acceptanceAcknowledgementUrl(
  uuid: string | null | undefined,
  site: { url?: string | null; publicSubdomain?: string | null } | null | undefined
): string | null {
  if (!uuid) return null;
  const onOwnHost = publicQuoteUrl({
    siteUrl: site?.url,
    publicSubdomain: site?.publicSubdomain,
    uuid,
  });
  const base =
    onOwnHost ||
    `${(process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(
      /\/$/,
      ""
    )}/q/${encodeURIComponent(uuid)}`;
  return `${base}/accepted?from=account`;
}
