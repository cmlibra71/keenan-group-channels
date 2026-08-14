// ============================================================================
// "Someone was added to your account" — the email the account manager gets.
//
// Steve, card 8LfB0DZS: "Any additional person added needs to have an email
// sent to the Account Manager notifying them that this was done and advising of
// their access level (Role)."
//
// Customer mail, so it carries the STOREFRONT's branding (CD green / IK red)
// like every other email a shopper gets — never the Keenan Group look
// (LgCYBeDT). Best effort: the customer's save has already succeeded by the
// time we send, so a mail failure is logged and swallowed, never surfaced as a
// failed save. EMAIL_GLOBAL_REDIRECT is honoured so a staging build cannot mail
// a real customer.
// ============================================================================

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { brandedEmailLayout, emailSource, resolveEmailBranding } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";
import type { AccountRoleOption } from "./account-roles";
import { personName, type AccountPerson } from "./account-people";

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "ap-southeast-2",
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface AddedPersonNotice {
  person: AccountPerson;
  role: AccountRoleOption | null;
}

/** Plain-text + HTML body for one or more added people. Pure, so it is testable. */
export function renderAddedPeopleEmail(input: {
  accountName: string | null;
  addedBy: string;
  added: AddedPersonNotice[];
}): { subject: string; html: string; text: string } {
  const account = input.accountName?.trim() || "your account";
  const many = input.added.length > 1;
  const subject = many
    ? `${input.added.length} people were added to ${account}`
    : `${personName(input.added[0]?.person ?? { firstName: "Someone", lastName: "" })} was added to ${account}`;

  const blocks = input.added
    .map(({ person, role }) => {
      const contactBits = [person.email, person.phone].filter(Boolean).map(escapeHtml).join(" &middot; ");
      const roleName = role?.name || person.roleName || "No role set";
      const bullets = (role?.details ?? [])
        .map((d) => `<li style="margin:0 0 4px 0;">${escapeHtml(d)}</li>`)
        .join("");
      return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:6px;margin:0 0 16px 0;">
          <tr><td style="padding:16px;">
            <p style="margin:0 0 4px 0;color:#1e293b;font-size:16px;font-weight:700;">${escapeHtml(personName(person))}</p>
            ${contactBits ? `<p style="margin:0 0 8px 0;color:#64748b;font-size:14px;">${contactBits}</p>` : ""}
            <p style="margin:0 0 6px 0;color:#1e293b;font-size:14px;">Access level: <strong>${escapeHtml(roleName)}</strong></p>
            ${bullets ? `<ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;">${bullets}</ul>` : ""}
          </td></tr>
        </table>`;
    })
    .join("");

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1e293b;font-size:22px;font-weight:700;">Someone was added to ${escapeHtml(account)}</h1>
    <p style="margin:0 0 20px 0;color:#475569;font-size:15px;">${escapeHtml(input.addedBy)} added ${many ? "these people" : "this person"} to the account. Their access level is shown below. If this is not right, change it on your account details page or tell us and we will.</p>
    ${blocks}
    <p style="margin:20px 0 0 0;color:#94a3b8;font-size:12px;">You are getting this because you are the manager on this account.</p>`;

  const text =
    `Someone was added to ${account}\n\n` +
    `${input.addedBy} added ${many ? "these people" : "this person"} to the account:\n\n` +
    input.added
      .map(({ person, role }) => {
        const lines = [
          personName(person),
          [person.email, person.phone].filter(Boolean).join(" · "),
          `Access level: ${role?.name || person.roleName || "No role set"}`,
          ...(role?.details ?? []).map((d) => `- ${d}`),
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n") +
    `\n\nIf this is not right, change it on your account details page or tell us and we will.\n`;

  return { subject, html: content, text };
}

/** Send it. Never throws. Returns the addresses actually mailed. */
export async function sendAddedPeopleEmail(input: {
  to: Array<{ name: string; email: string }>;
  accountName: string | null;
  addedBy: string;
  added: AddedPersonNotice[];
}): Promise<string[]> {
  if (input.to.length === 0 || input.added.length === 0) return [];
  try {
    const redirect = process.env.EMAIL_GLOBAL_REDIRECT?.trim();
    const recipients = redirect ? [redirect] : input.to.map((t) => t.email);
    const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
    const { subject, html, text } = renderAddedPeopleEmail(input);

    await ses.send(
      new SendEmailCommand({
        Source: emailSource(branding),
        Destination: { ToAddresses: recipients },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: brandedEmailLayout(subject, html, undefined, branding), Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      })
    );
    return recipients;
  } catch (e) {
    console.error("[account-people] manager notification failed (save kept):", e);
    return [];
  }
}
