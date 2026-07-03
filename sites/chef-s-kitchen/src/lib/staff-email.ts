import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { brandedEmailLayout, brandedButton } from "@keenan/services";
import { channelSettingsService, CHANNEL_ID } from "@/lib/store";

// Internal staff notifications (quote accepted, new review, …) — NOT customer
// mail. Customer-facing email lives in @keenan/services with per-channel
// branding; this is a deliberately plain "something needs your attention in
// the portal" note to the Keenan team.
//
// Recipient resolution: the per-channel `staff_notifications_email` setting
// (editable at portal Settings → Notifications, no redeploy) wins, then the
// STAFF_NOTIFICATIONS_EMAIL env var. When neither is set the send is skipped
// with a warning so customer actions never depend on it. Sends are
// best-effort: callers must swallow failures (the customer's action already
// succeeded by the time we notify).

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-southeast-2",
});

const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || "noreply@keenan-group.com.au";
const PORTAL_URL = "https://keenan-group.com.au";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendStaffNotification({
  subject,
  heading,
  rows,
  portalPath,
  linkLabel,
}: {
  subject: string;
  heading: string;
  /** Label/value pairs rendered as a simple details table. */
  rows: Array<[string, string]>;
  /** Portal path (e.g. `/dashboard/quotes/123`) the action button links to. */
  portalPath: string;
  linkLabel: string;
}): Promise<void> {
  // EMAIL_GLOBAL_REDIRECT mirrors the @keenan/services test-safety guard: a
  // staging build must never notify the real staff inbox.
  let to = process.env.EMAIL_GLOBAL_REDIRECT || null;
  if (!to) {
    try {
      const setting = await channelSettingsService.getByKey(CHANNEL_ID, "staff_notifications_email");
      const value = setting?.setting_value;
      if (typeof value === "string" && value.trim()) to = value.trim();
    } catch {
      // Setting not configured for this channel — fall through to the env var.
    }
  }
  if (!to) to = process.env.STAFF_NOTIFICATIONS_EMAIL || null;
  if (!to) {
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

  // Staff mail rides the canonical layout with NO branding — Keenan Group header,
  // not the storefront's, since it's an internal "look at the portal" note.
  const content = `
    <h1 style="margin: 0 0 16px 0; color: #1e293b; font-size: 22px; font-weight: 700; text-align: center;">${escapeHtml(heading)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto 24px auto;">${tableRows}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" style="padding: 8px 0;">${brandedButton(escapeHtml(linkLabel), link)}</td></tr>
    </table>
    <p style="margin: 24px 0 0 0; color: #94a3b8; font-size: 12px; text-align: center;">Automated notification from the storefront.</p>`;

  const html = brandedEmailLayout(subject, content);

  const text =
    `${heading}\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    `\n\n${linkLabel}: ${link}\n`;

  await sesClient.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
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
