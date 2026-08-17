import "server-only";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  brandedEmailLayout,
  brandedButton,
  emailSource,
  resolveEmailBranding,
} from "@keenan/services";
import { CHANNEL_ID, getSiteConfig } from "@/lib/store";
import { siteBaseUrl } from "@/lib/seo";
import { quoteGstTotals, isMoneyRow, type QuoteGstInput } from "@/lib/quotes/quote-gst";
import { resolveQuoteGstRate } from "@/lib/quotes/quote-gst-rate";
import { resolveQuoteTotal } from "@/lib/quotes/price-visibility";
import { readQuoteDeposit, resolveQuoteDeposit, depositLabel } from "@/lib/quotes/quote-deposit";
import { PLUS_FREIGHT_NOTICE } from "@/lib/quotes/quote-payable";

/**
 * The pro-forma a customer receives when they ACCEPT a quote without paying it.
 *
 * Steve, card 0Wy0xHuq: "The button should say 'Accept Quote'. When they accept
 * without paying, they get sent a Quote to Pro-Forma." A pro-forma is the
 * document that says "this is now agreed, here is what to pay and how" — so it
 * restates the quote as an amount payable (GST-INCLUSIVE, with ex-GST and GST
 * broken out), names the deposit when the rep set one, carries the Plus Freight
 * warning when no delivery charge was allocated, and links straight back to the
 * quote in the customer's account area where they can pay it.
 *
 * It deliberately raises no order and no invoice number: the order is created
 * when money is actually taken (payQuote) or when staff convert the quote. This
 * is paperwork, not a transaction.
 *
 * Best-effort — a mail failure must never fail the acceptance the customer just
 * made, so every caller swallows it.
 */

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-southeast-2",
});

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

/** Send the pro-forma for an accepted quote. Never throws. */
export async function sendQuoteProForma(quote: QuoteRow, to: string | null): Promise<void> {
  const recipient = (process.env.EMAIL_GLOBAL_REDIRECT?.trim() || to || "").trim();
  if (!recipient) return;

  const currency = (quote.currency_code as string) || "AUD";
  const rate = await resolveQuoteGstRate(quote.tax_class_id);
  const gst = quoteGstTotals(resolveQuoteTotal(quote) ?? 0, quote, rate);
  // A store credit settles the inclusive total, so the deposit and the
  // headline are both taken from what is left TO pay (card vkYOSmJj).
  const deposit = resolveQuoteDeposit(readQuoteDeposit(quote.attributes), gst.payableInc);
  const freightPending = !isMoneyRow(gst.freightEx);

  const [{ site }, branding] = await Promise.all([
    getSiteConfig(),
    resolveEmailBranding(CHANNEL_ID).catch(() => undefined),
  ]);
  const siteUrl = siteBaseUrl(site?.url);
  const payLink = `${siteUrl}/account/quotes/${quote.id}`;
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
      This pro-forma sets out what is now agreed and what to pay.
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
      ${brandedButton("Pay this quote", payLink, branding?.brandColor ?? undefined)}
    </td></tr></table>
    <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
      Sign in to your account to pay, or reply to this email and we&apos;ll help.
    </p>`;

  const html = brandedEmailLayout(subject, content, undefined, branding);

  const text = [
    `Pro-forma for quote ${reference}`,
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
    `Pay it here: ${payLink}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  await sesClient.send(
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
    })
  );
}
