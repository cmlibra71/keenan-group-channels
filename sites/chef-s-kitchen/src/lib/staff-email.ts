import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Internal staff notifications (quote accepted, new review, …) — NOT customer
// mail. Customer-facing email lives in @keenan/services with per-channel
// branding; this is a deliberately plain "something needs your attention in
// the portal" note to the Keenan team.
//
// Recipient comes from STAFF_NOTIFICATIONS_EMAIL. When unset the send is
// skipped with a warning so customer actions never depend on it. Sends are
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
  const to = process.env.EMAIL_GLOBAL_REDIRECT || process.env.STAFF_NOTIFICATIONS_EMAIL;
  if (!to) {
    console.warn(`[staff-email] STAFF_NOTIFICATIONS_EMAIL not set — skipping "${subject}"`);
    return;
  }

  const link = `${PORTAL_URL}${portalPath}`;
  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#111827;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#111827;font-size:18px;margin:0 0 16px;">${escapeHtml(heading)}</h2>
      <table style="border-collapse:collapse;font-size:14px;margin:0 0 24px;">${tableRows}</table>
      <a href="${link}" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 20px;border-radius:6px;font-size:14px;text-decoration:none;">${escapeHtml(linkLabel)}</a>
      <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">Automated notification from the storefront — Keenan Group portal.</p>
    </div>`;

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
