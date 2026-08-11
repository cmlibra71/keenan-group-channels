import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  brandedEmailLayout,
  brandedButton,
  emailSource,
  resolveEmailBranding,
  resolveChannelStaffNotificationRecipients,
  resolveOrderNotificationRecipients,
  excludePurchaser,
} from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

// Internal staff notifications (new review, below-cost order lines, …) — NOT
// customer mail, but still CHANNEL mail: it is branded with the storefront the
// event happened on (logo, accent, sender, footer) so a Chef's Depot alert never
// arrives looking like Keenan Group. Branding comes from the same
// `resolveEmailBranding` every customer email uses; a channel with nothing
// configured falls back to Keenan, as before.
//
// NOTE quote acceptance is deliberately NOT sent from here. `markAccepted` in
// @keenan/services already alerts staff on every acceptance path (storefront,
// magic link, portal); a second send from this helper would put two
// near-identical emails in every inbox.
//
// Recipient resolution is shared with the portal, and each alert goes to the
// list the portal's Settings → Notifications page actually governs for it:
//
//   audience "staff"  → `staff_notification_emails` (quote + storefront alerts),
//                       then the legacy single-address key, then the
//                       STAFF_NOTIFICATIONS_EMAIL env var.
//   audience "orders" → `order_notification_emails` (the people already told
//                       about every order), falling back to the staff list so an
//                       unconfigured channel still alerts someone rather than
//                       silently dropping the warning.
//
// When nothing resolves the send is skipped with a warning so customer actions
// never depend on it. Sends are best-effort: callers must swallow failures (the
// customer's action already succeeded by the time we notify).

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-southeast-2",
});

const PORTAL_URL = "https://keenan-group.com.au";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Which configured recipient list an alert belongs to. */
export type StaffNotificationAudience = "staff" | "orders";

/** Resolve the audience's recipient list; never throws. */
async function resolveRecipients(audience: StaffNotificationAudience): Promise<string[]> {
  const staffList = () =>
    resolveChannelStaffNotificationRecipients(CHANNEL_ID, {
      envFallback: process.env.STAFF_NOTIFICATIONS_EMAIL,
    }).catch(() => []);

  if (audience !== "orders") return staffList();

  // Order-scoped alerts go to the "Order notifications" list. That list has no
  // env fallback of its own (an absent key means opt-out for order confirmations),
  // so fall back to the staff list here rather than silently dropping a warning
  // staff currently receive on a channel that has not configured one.
  const orderRecipients = await resolveOrderNotificationRecipients(CHANNEL_ID).catch(() => []);
  return orderRecipients.length > 0 ? orderRecipients : staffList();
}

export async function sendStaffNotification({
  subject,
  heading,
  rows,
  portalPath,
  linkLabel,
  audience = "staff",
  excludeEmail,
}: {
  subject: string;
  heading: string;
  /** Label/value pairs rendered as a simple details table. */
  rows: Array<[string, string]>;
  /** Portal path (e.g. `/dashboard/quotes/123`) the action button links to. */
  portalPath: string;
  linkLabel: string;
  /** Which portal recipient list to notify. Defaults to the staff list. */
  audience?: StaffNotificationAudience;
  /**
   * Address to drop from the resolved list — the person whose own action raised
   * the alert. A staff member who is on the notification list and buys from the
   * storefront already gets their customer email; the internal copy about their
   * own order is the second, unexpected email. Omit to notify everyone.
   */
  excludeEmail?: string | null;
}): Promise<void> {
  // EMAIL_GLOBAL_REDIRECT mirrors the @keenan/services test-safety guard: a
  // staging build must never notify the real staff inbox.
  const redirect = process.env.EMAIL_GLOBAL_REDIRECT?.trim();
  // The redirect inbox is a test-safety override and is deliberately never filtered.
  const recipients = redirect
    ? [redirect]
    : excludePurchaser(await resolveRecipients(audience), excludeEmail);
  if (recipients.length === 0) {
    console.warn(`[staff-email] no staff notification recipient configured — skipping "${subject}"`);
    return;
  }

  const link = `${PORTAL_URL}${portalPath}`;
  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#1e293b;font-size:14px;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  // Never fatal: an unresolvable channel just leaves the Keenan default in place.
  const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);

  const content = `
    <h1 style="margin: 0 0 16px 0; color: #1e293b; font-size: 22px; font-weight: 700; text-align: center;">${escapeHtml(heading)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto 24px auto;">${tableRows}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" style="padding: 8px 0;">${brandedButton(escapeHtml(linkLabel), link, branding?.brandColor ?? undefined)}</td></tr>
    </table>
    <p style="margin: 24px 0 0 0; color: #94a3b8; font-size: 12px; text-align: center;">Automated notification from the storefront.</p>`;

  const html = brandedEmailLayout(subject, content, undefined, branding);

  const text =
    `${heading}\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    `\n\n${linkLabel}: ${link}\n`;

  await sesClient.send(
    new SendEmailCommand({
      Source: emailSource(branding),
      Destination: { ToAddresses: recipients },
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
