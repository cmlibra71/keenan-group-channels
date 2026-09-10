// ============================================================================
// Filing a checkout exit survey (card loDyEE3S).
//
// THE SUBMISSION ROW IS THE SYSTEM OF RECORD — the same contract every builder
// form works to (lib/actions/forms.ts) and the same one the finance application
// uses (lib/checkout/finance-application.ts). The answers land in the portal's
// enquiries list, which is where Steve's question ("where do you want this
// sent to? Or do you want the survey results collected inside the platform?")
// is answered for now: inside the platform.
//
// NOBODY IS EMAILED TODAY, AND THAT IS A SETTING RATHER THAN A DECISION BAKED
// INTO THIS FILE. The form ships with no recipients, so the destination ladder
// below resolves to nobody and the row is stamped `skipped` rather than left
// reading "pending" forever on the enquiry screen. Put an address on the form
// (or a channel-wide form destination) and the very next survey mails it — the
// SAME ladder `resolveFormNotificationRecipients` gives every other form and
// the portal's own "Resend notification" button, so what a staff member proves
// by pressing Resend once is what happens automatically from then on. That is
// what makes "adding a destination later is a settings change, not a rebuild"
// a fact rather than a hope. It does NOT go through `submitForm`, which would
// also apply that form's Turnstile/honeypot contract and its post-submit
// redirect — neither of which a fire-and-forget beacon can carry.
//
// One consequence worth knowing before you set it: a destination here means one
// email per ABANDONED BASKET, not one per person who wrote in. The way to have
// the survey and not the mail on a site that has a channel-wide form
// destination is an EMPTY per-site recipient list on this form — an
// existing-but-empty list is the platform's deliberate "email nobody here".
//
// NOTHING HERE MAY THROW. The shopper is mid-navigation with a modal in front
// of them; a failed insert must cost them nothing but the answer.
// ============================================================================

import {
  cmsFormService,
  cmsFormSubmissionService,
  ensureCheckoutSurveyForm,
  parseFieldDefs,
  renderThankYouCopy,
  resolveFormNotificationRecipients,
  thankYouBodyHtml,
  CHECKOUT_SURVEY_FORM_KEY,
} from "@keenan/services/services";
import {
  resolveEmailBranding,
  sendFormSubmissionStaffEmail,
  sendFormThankYouEmail,
} from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

const PORTAL_URL = (process.env.PORTAL_BASE_URL || process.env.PORTAL_URL || "https://keenan-group.com.au").replace(/\/$/, "");

export async function fileCheckoutSurvey(
  values: Record<string, string>
): Promise<{ stored: boolean }> {
  let submission: Record<string, unknown>;
  let form: Record<string, unknown>;
  try {
    // Provisions the shared form on first use AND re-asserts its stored field
    // contract, which is what the answer about to be written is validated
    // against. Without that, a release that adds a reason would have every
    // survey carrying the new option refused behind an on-screen thank-you.
    await ensureCheckoutSurveyForm(CHANNEL_ID);
    const created = (await cmsFormSubmissionService.createFromStorefront({
      formKey: CHECKOUT_SURVEY_FORM_KEY,
      channelId: CHANNEL_ID,
      values,
      pagePath: "/checkout",
    })) as { submission: Record<string, unknown>; form: Record<string, unknown> };
    submission = created.submission;
    form = created.form;
  } catch (e) {
    console.error("[checkout-survey] answer NOT stored:", e);
    return { stored: false };
  }

  // Best-effort, and the enquiry is already safe. Awaited rather than
  // fire-and-forget: this runs inside a request the browser may already have
  // walked away from, so there is nothing left to keep the process alive if we
  // return first.
  await deliverSurveyNotifications(submission, form).catch((e) =>
    console.error("[checkout-survey] notification pipeline failed:", e)
  );

  return { stored: true };
}

/**
 * Both halves of the enquiry's Delivery card, stamped with what actually
 * happened.
 *
 * `notify_status` and `ack_status` both DEFAULT to "pending" and the enquiry
 * screen renders them verbatim as "Staff email" and "Thank-you", so a row left
 * unstamped tells customer service, on every survey and for good, that two
 * emails are still on their way.
 */
async function deliverSurveyNotifications(
  submission: Record<string, unknown>,
  form: Record<string, unknown>
): Promise<void> {
  const submissionId = submission.id as number;
  const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
  const defs = parseFieldDefs(form.fields);
  const lines = Object.entries((submission.payload ?? {}) as Record<string, unknown>).map(
    ([name, value]) => ({
      label: defs.find((f) => f.name === name)?.label ?? name,
      value: String(value ?? ""),
    })
  );

  // ── Staff notification ──
  try {
    const to = await resolveFormNotificationRecipients(
      {
        id: form.id as number,
        key: form.key,
        default_recipient_emails: form.default_recipient_emails,
      },
      CHANNEL_ID,
      { accountId: (submission.account_id as number | null) ?? null }
    );
    if (!to.length) {
      await cmsFormSubmissionService.recordNotifyResult(submissionId, { status: "skipped" });
    } else {
      const sent = await sendFormSubmissionStaffEmail({
        to,
        formName: String(form.name ?? "Checkout Survey"),
        submissionUrl: `${PORTAL_URL}/dashboard/enquiries/${submission.uuid}`,
        fields: lines,
        replyTo: (submission.submitter_email as string) || null,
        branding,
        pagePath: (submission.page_path as string) || "/checkout",
      });
      await cmsFormSubmissionService.recordNotifyResult(submissionId, {
        status: sent ? "sent" : "failed",
        emails: to,
        error: sent ? null : "SES send returned false",
      });
    }
  } catch (e) {
    await cmsFormSubmissionService
      .recordNotifyResult(submissionId, {
        status: "failed",
        error: e instanceof Error ? e.message : "unknown",
      })
      .catch(() => undefined);
  }

  // ── Customer acknowledgement ──
  // Off by default on this form and it should stay off: a shopper who is
  // halfway out of the checkout is the last person who wants "thanks for your
  // message". But it is read from the form rather than assumed, so a staff
  // member who turns it on gets it, and the stamp keeps telling the truth
  // either way.
  const to = submission.submitter_email as string | null;
  if (!to || form.notify_submitter === false) {
    await cmsFormSubmissionService.recordAckResult(submissionId, "skipped").catch(() => undefined);
    return;
  }
  try {
    const routing = (await cmsFormService
      .getRoutingForChannel(form.id as number, CHANNEL_ID)
      .catch(() => null)) as { thank_you_subject?: string; thank_you_body?: string } | null;
    const tokens = {
      name: (submission.submitter_name as string) || undefined,
      store: branding?.storeName,
      form: String(form.name ?? ""),
    };
    const subjectTpl = routing?.thank_you_subject || (form.thank_you_subject as string) || null;
    const bodyTpl = routing?.thank_you_body || (form.thank_you_body as string) || null;
    const sent = await sendFormThankYouEmail({
      to,
      formName: String(form.name ?? "Checkout Survey"),
      branding: branding ?? { storeName: "Keenan Group" },
      subject: subjectTpl ? renderThankYouCopy(subjectTpl, tokens) : null,
      bodyHtml: bodyTpl ? thankYouBodyHtml(bodyTpl, tokens) : null,
      submittedFields: lines,
    });
    await cmsFormSubmissionService.recordAckResult(submissionId, sent ? "sent" : "failed");
  } catch (e) {
    console.error("[checkout-survey] thank-you failed:", e);
    await cmsFormSubmissionService.recordAckResult(submissionId, "failed").catch(() => undefined);
  }
}
