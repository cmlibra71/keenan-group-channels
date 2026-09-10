import "server-only";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import {
  brandedEmailLayout,
  brandedButton,
  emailSource,
  resolveEmailBranding,
  safeSesSend,
} from "@keenan/services";
import { CHANNEL_ID, getSiteConfig } from "@/lib/store";
import { siteBaseUrl } from "@/lib/seo";
import { quoteGstTotals, isMoneyRow, type QuoteGstInput } from "@/lib/quotes/quote-gst";
import { resolveQuoteGstRate } from "@/lib/quotes/quote-gst-rate";
import { resolveQuoteTotal } from "@/lib/quotes/price-visibility";
import { readQuoteDeposit, resolveQuoteDeposit, depositLabel } from "@/lib/quotes/quote-deposit";
import { PLUS_FREIGHT_NOTICE } from "@/lib/quotes/quote-payable";
import { quoteFreightStillPending } from "@/lib/quotes/freight-pending";
import { getCheckoutSettings } from "@/lib/store";
import { cardPaymentAvailable } from "@/lib/orders/pay-balance";
import { proFormaPayCall } from "@/lib/quotes/pro-forma-pay-call";

/**
 * The pro-forma a customer receives when they ACCEPT a quote without paying it.
 *
 * Steve, card 0Wy0xHuq: "The button should say 'Accept Quote'. When they accept
 * without paying, they get sent a Quote to Pro-Forma." A pro-forma is the
 * document that says "this is now agreed, here is what to pay and how" — so it
 * restates the quote as an amount payable (GST-INCLUSIVE, with ex-GST and GST
 * broken out), names the deposit when the rep set one, carries the Plus Freight
 * warning when no delivery charge was allocated, and links the customer to where
 * they pay it.
 *
 * WHERE THAT LINK POINTS DEPENDS ON WHETHER THE ACCEPTANCE RAISED AN ORDER
 * (card isl1uwjR, Tim 2026-09-08). Until that card, accepting here never
 * converted, so the button was "Pay this quote" pointing at the quote in the
 * account area. Now a quote carrying its delivery converts on acceptance, and
 * `converted_to_order` is a TERMINAL pay state on that quote page
 * (`quote-payable.ts`, card 0Wy0xHuq) — so the old button would have sent the
 * customer to a page whose Pay control the same request had just retired. This
 * is the ONLY email the account-acceptance path sends, so that link is the whole
 * of what the customer is told and it has to be true. When `convertedOrderId` is
 * given the document names the order and points at `/account/orders/<id>`, where
 * card Sh03niVC's Pay-by-card control lives; with no order it is unchanged.
 *
 * THE VERB IS NOT A PROMISE THIS STOREFRONT CANNOT KEEP. "Pay your order" only
 * appears where the channel actually offers cards to customers (`stripe` among
 * `customerPaymentMethods`, the same list checkout and the order page read) —
 * true of Chefs Depot, false of Industry Kitchens, which says "View your order"
 * and pays by invoice. A per-account restriction can still narrow it further on
 * the order page itself; the label is deliberately the channel-level answer,
 * because an email cannot re-decide a payment.
 *
 * It still raises no order and no invoice number of its own: the order is
 * created by the acceptance follow-up, by payQuote, or by staff converting. This
 * is paperwork, not a transaction.
 *
 * Best-effort — a mail failure must never fail the acceptance the customer just
 * made, so every caller swallows it.
 *
 * IT GOES THROUGH THE SHARED WRAPPER, not a bare SES client of its own (card oLF9OgFs).
 * On this path it is the ONLY email the customer receives — `acceptQuote` tells the portal's
 * acceptance follow-up `customerAlreadyNotified`, so no confirmation is sent beside it — and a
 * bare client meant it left no row on the quote's Emails card, none on the person's history, no
 * SES configuration set (so it could never report Delivered or Bounced) and no test-safety
 * redirect. Steve, 2026-08-26: the Quote History records everything and the Emails sent panel
 * captures nothing. `safeSesSend` supplies all four from the one call.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount: number, currency: string | null): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
  }).format(amount);
}

type QuoteRow = Record<string, unknown> &
  QuoteGstInput & {
    id: number;
    items?: Record<string, unknown>[];
  };

export interface ProFormaOptions {
  /**
   * The order this acceptance raised, when it raised one (card isl1uwjR).
   * Null/absent keeps the pre-isl1uwjR wording, which is what an unconverted
   * acceptance — and a portal one release back that does not report the id —
   * must still get.
   */
  convertedOrderId?: number | null;
}

/** Send the pro-forma for an accepted quote. Never throws. */
export async function sendQuoteProForma(
  quote: QuoteRow,
  to: string | null,
  options: ProFormaOptions = {}
): Promise<void> {
  // EMAIL_GLOBAL_REDIRECT is no longer read here: `safeSesSend` applies it — and the @e2e.test
  // swap, the tracking CC and the `[TEST — who]` subject with it — from `resolveTestRedirect`,
  // which is the ONE place the test-safety rule lives. A pro-forma addressed to nobody is not
  // sent at all, where the old line would still have mailed the redirect inbox.
  const recipient = (to || "").trim();
  if (!recipient) return;

  const currency = (quote.currency_code as string) || "AUD";
  const rate = await resolveQuoteGstRate(quote.tax_class_id);
  const gst = quoteGstTotals(resolveQuoteTotal(quote) ?? 0, quote, rate);
  // A store credit settles the inclusive total, so the deposit and the
  // headline are both taken from what is left TO pay (card vkYOSmJj).
  const deposit = resolveQuoteDeposit(readQuoteDeposit(quote.attributes), gst.payableInc);
  // Same predicate as the portal's conversion gate (card 9XRQmaiz): a priced
  // delivery LINE or a Pickup / Free delivery basis means delivery IS accounted
  // for, so the pro-forma must not tell the customer it will be quoted separately.
  const freightPending = quoteFreightStillPending(quote, gst.freightEx);

  const orderId =
    typeof options.convertedOrderId === "number" && options.convertedOrderId > 0
      ? options.convertedOrderId
      : null;

  const [{ site }, branding, checkout] = await Promise.all([
    getSiteConfig(),
    resolveEmailBranding(CHANNEL_ID).catch(() => undefined),
    // Only asked when there IS an order to send them to, and never allowed to
    // fail the email: an unknown answer reads as "no card here", which
    // under-promises rather than over-promising.
    orderId ? getCheckoutSettings().catch(() => null) : Promise.resolve(null),
  ]);
  const siteUrl = siteBaseUrl(site?.url);
  // The whole decision — where the button goes, what it says, and what the
  // sentence under it promises — is the pure `proFormaPayCall`, so it can be
  // asked in a test rather than asserted against this file's source.
  const payCall = proFormaPayCall({
    siteUrl,
    quoteId: quote.id,
    convertedOrderId: orderId,
    canPayByCard: cardPaymentAvailable((checkout?.customerPaymentMethods ?? []).map((m) => m.id)),
  });
  const reference = (quote.quote_number as string) || `#${quote.id}`;
  const subject = `Pro-forma for quote ${reference}`;

  const items = (quote.items ?? []) as Record<string, unknown>[];
  const itemRows = items
    .map((it) => {
      const qty = Number(it.quantity ?? 1);
      const unit = Number(it.sale_price ?? it.list_price ?? 0);
      const line = Number.isFinite(unit) ? money(unit * qty, currency) : "—";
      return (
        `<tr><td style="padding:6px 12px 6px 0;color:#1e293b;font-size:14px;">${escapeHtml(
          (it.product_name as string) || "Item"
        )} × ${qty}</td>` +
        `<td style="padding:6px 0;color:#1e293b;font-size:14px;text-align:right;white-space:nowrap;">${line}</td></tr>`
      );
    })
    .join("");

  const summaryRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 12px 4px 0;color:${strong ? "#1e293b" : "#64748b"};font-size:${
      strong ? "15px" : "14px"
    };font-weight:${strong ? 700 : 400};">${escapeHtml(label)}</td>` +
    `<td style="padding:4px 0;color:#1e293b;font-size:${strong ? "15px" : "14px"};font-weight:${
      strong ? 700 : 400
    };text-align:right;white-space:nowrap;">${value}</td></tr>`;

  const summary =
    summaryRow("Subtotal (ex GST)", money(gst.subtotalEx, currency)) +
    (isMoneyRow(gst.freightEx) ? summaryRow("Freight (ex GST)", money(gst.freightEx, currency)) : "") +
    summaryRow("GST", money(gst.tax, currency)) +
    (isMoneyRow(gst.creditInc)
      ? summaryRow("Total (inc GST)", money(gst.incTax, currency)) +
        summaryRow("Store credit", `-${money(gst.creditInc, currency)}`)
      : "") +
    summaryRow("Amount payable (inc GST)", money(gst.payableInc, currency), true) +
    (deposit
      ? summaryRow(depositLabel(deposit), money(deposit.due_now, currency), true) +
        summaryRow("Balance", money(deposit.balance, currency))
      : "");

  const content = `
    <h1 style="margin:0 0 8px 0;color:#1e293b;font-size:24px;font-weight:700;text-align:center;">Pro-forma</h1>
    <p style="margin:0 0 20px 0;color:#64748b;font-size:15px;text-align:center;line-height:1.6;">
      Thanks for accepting quote <strong style="color:#1e293b;">${escapeHtml(reference)}</strong>.
      This pro-forma sets out what is now agreed and what to pay.${
        payCall.intro ? ` ${escapeHtml(payCall.intro)}` : ""
      }
    </p>
    <table role="presentation" width="100%" style="margin:0 0 12px 0;border-collapse:collapse;"><tbody>${itemRows}</tbody></table>
    <table role="presentation" width="100%" style="border-top:1px solid #e4e4e7;padding-top:8px;border-collapse:collapse;"><tbody>${summary}</tbody></table>
    ${
      freightPending
        ? `<p style="margin:16px 0 0 0;padding:12px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;color:#92400e;font-size:14px;line-height:1.5;"><strong>${escapeHtml(
            PLUS_FREIGHT_NOTICE
          )}</strong></p>`
        : ""
    }
    <table role="presentation" width="100%"><tr><td align="center" style="padding:24px 0 8px 0;">
      ${brandedButton(payCall.label, payCall.href, branding?.brandColor ?? undefined)}
    </td></tr></table>
    <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
      ${escapeHtml(payCall.footer)}
    </p>`;

  const html = brandedEmailLayout(subject, content, undefined, branding);

  const text = [
    `Pro-forma for quote ${reference}`,
    payCall.intro,
    "",
    ...items.map((it) => `- ${(it.product_name as string) || "Item"} x ${Number(it.quantity ?? 1)}`),
    "",
    `Subtotal (ex GST): ${money(gst.subtotalEx, currency)}`,
    isMoneyRow(gst.freightEx) ? `Freight (ex GST): ${money(gst.freightEx, currency)}` : "",
    `GST: ${money(gst.tax, currency)}`,
    isMoneyRow(gst.creditInc) ? `Total (inc GST): ${money(gst.incTax, currency)}` : "",
    isMoneyRow(gst.creditInc) ? `Store credit: -${money(gst.creditInc, currency)}` : "",
    `Amount payable (inc GST): ${money(gst.payableInc, currency)}`,
    deposit ? `${depositLabel(deposit)}: ${money(deposit.due_now, currency)}` : "",
    deposit ? `Balance: ${money(deposit.balance, currency)}` : "",
    freightPending ? `\n${PLUS_FREIGHT_NOTICE}` : "",
    "",
    `${payCall.label}: ${payCall.href}`,
    payCall.footer,
  ]
    .filter((l) => l !== "")
    .join("\n");

  await safeSesSend(
    new SendEmailCommand({
      Source: emailSource(branding),
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }),
    {
      // Writes the quote's own `quote.email_sent` row AND the recipient's `contact.email_sent`
      // row from this single call, so the two trails can never disagree about what went out.
      emailKind: "quote_proforma",
      quoteId: quote.id,
      channelId: CHANNEL_ID,
      purchaser: recipient,
      testMode: (quote.attributes as Record<string, unknown> | null | undefined)?.test_mode === true,
    }
  );
}
