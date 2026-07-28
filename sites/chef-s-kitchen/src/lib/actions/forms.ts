"use server";

import { headers } from "next/headers";
import {
  cmsFormSubmissionService,
  cmsFormSubmissionFileService,
  resolveFormNotificationRecipients,
  thankYouBodyHtml,
  renderThankYouCopy,
  parseFieldDefs,
  cmsFormService,
} from "@keenan/services/services";
import {
  resolveEmailBranding,
  sendFormSubmissionStaffEmail,
  sendFormThankYouEmail,
} from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sizeLabel } from "@/lib/form-uploads";

// ============================================================================
// The builder-form submit path.
//
// The SUBMISSION ROW IS THE SYSTEM OF RECORD. Both emails are best-effort
// afterwards: if SES is down the customer still gets a confirmation and staff
// see the enquiry in the portal (flagged "not emailed", with a resend).
//
// Returns an explicit `success` key — the builder's action runner treats a
// bare {error} as success, so the shape matters.
// ============================================================================

const PORTAL_URL = process.env.PORTAL_URL || "https://keenan-group.com.au";

export interface SubmitFormInput {
  formKey: string;
  values: Record<string, unknown>;
  uploadToken?: string;
  /** Honeypot — a real person leaves this empty. */
  hp?: string;
  /** Client mount timestamp (ms) for the dwell check. */
  t?: number;
  pagePath?: string;
  turnstileToken?: string;
}

export type SubmitFormResult =
  | { success: true; submissionUuid: string }
  | { success: false; error: string };

export async function submitForm(input: SubmitFormInput): Promise<SubmitFormResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || "unknown";
  const userAgent = h.get("user-agent") ?? undefined;

  // ── Spam gates. A caught bot gets SUCCESS, never a hint about why. ──
  if (input.hp && String(input.hp).trim() !== "") return silentOk();
  if (typeof input.t === "number" && input.t > 0 && Date.now() - input.t < 2000) return silentOk();
  if (!(await verifyTurnstile(input.turnstileToken, ip)))
    return { success: false, error: "Please complete the verification and try again." };

  if (JSON.stringify(input.values ?? {}).length > 20_000)
    return { success: false, error: "That message is too long to send." };

  const key = String(input.formKey || "");
  if (!key) return { success: false, error: "This form isn't configured correctly." };
  if (
    !slidingWindowAllow(`form:${key}:${ip}`, { windowMs: 60_000, max: 3 }) ||
    !slidingWindowAllow(`form-hr:${key}:${ip}`, { windowMs: 3_600_000, max: 20 })
  )
    return { success: false, error: "Too many submissions — please try again shortly." };

  // ── Persist (validation lives inside the service) ──
  let created;
  try {
    created = await cmsFormSubmissionService.createFromStorefront({
      formKey: key,
      channelId: CHANNEL_ID,
      values: input.values ?? {},
      uploadToken: input.uploadToken ?? null,
      pagePath: input.pagePath ?? null,
      ipAddress: ip,
      userAgent,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // ValidationError messages are written for the customer; anything else is
    // ours to hide.
    const isValidation = (e as { statusCode?: number })?.statusCode === 422;
    if (!isValidation) console.error("[submitForm] persist failed:", e);
    return {
      success: false,
      error: isValidation && msg ? msg : "Sorry — we couldn't send that. Please try again.",
    };
  }

  const { submission, form, files } = created as {
    submission: Record<string, unknown>;
    form: Record<string, unknown>;
    files: Record<string, unknown>[];
  };
  const submissionId = submission.id as number;

  // ── Everything below is best-effort; the enquiry is already safe. ──
  void deliverNotifications({ submission, form, files }).catch((e) =>
    console.error("[submitForm] notification pipeline failed:", e)
  );

  return { success: true, submissionUuid: String(submission.uuid) };
}

/** A bot sees exactly what a person sees. */
function silentOk(): SubmitFormResult {
  return { success: true, submissionUuid: "" };
}

async function deliverNotifications(ctx: {
  submission: Record<string, unknown>;
  form: Record<string, unknown>;
  files: Record<string, unknown>[];
}) {
  const { submission, form, files } = ctx;
  const submissionId = submission.id as number;
  const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
  const fieldDefs = parseFieldDefs(form.fields);
  const payload = (submission.payload ?? {}) as Record<string, unknown>;

  // Label each answer using the form's own field labels; fall back to the raw
  // key so a drifted definition still produces a readable email.
  const lines = Object.entries(payload).map(([name, value]) => ({
    label: fieldDefs.find((f) => f.name === name)?.label ?? name,
    value: String(value ?? ""),
  }));
  const attachments = files.map((f) => ({
    fileName: String(f.file_name ?? "attachment"),
    sizeLabel: typeof f.file_size === "number" ? sizeLabel(f.file_size) : undefined,
  }));

  // ── Staff notification ──
  try {
    const to = await resolveFormNotificationRecipients(
      { id: form.id as number, default_recipient_emails: form.default_recipient_emails },
      CHANNEL_ID
    );
    if (!to.length) {
      await cmsFormSubmissionService.recordNotifyResult(submissionId, { status: "skipped" });
    } else {
      const sent = await sendFormSubmissionStaffEmail({
        to,
        formName: String(form.name ?? "Enquiry"),
        submissionUrl: `${PORTAL_URL}/dashboard/enquiries/${submission.uuid}`,
        fields: lines,
        attachments: attachments.length ? attachments : undefined,
        replyTo: (submission.submitter_email as string) || null,
        branding,
        pagePath: (submission.page_path as string) || null,
      });
      await cmsFormSubmissionService.recordNotifyResult(submissionId, {
        status: sent ? "sent" : "failed",
        emails: to,
        error: sent ? null : "SES send returned false",
      });
    }
  } catch (e) {
    await cmsFormSubmissionService
      .recordNotifyResult(submissionId, { status: "failed", error: e instanceof Error ? e.message : "unknown" })
      .catch(() => undefined);
  }

  // ── Customer acknowledgement ──
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
    // Per-site copy wins over the form default.
    const subjectTpl = routing?.thank_you_subject || (form.thank_you_subject as string) || null;
    const bodyTpl = routing?.thank_you_body || (form.thank_you_body as string) || null;
    const sent = await sendFormThankYouEmail({
      to,
      formName: String(form.name ?? "Enquiry"),
      branding: branding ?? { storeName: "Keenan Group" },
      subject: subjectTpl ? renderThankYouCopy(subjectTpl, tokens) : null,
      bodyHtml: bodyTpl ? thankYouBodyHtml(bodyTpl, tokens) : null,
      submittedFields: lines,
    });
    await cmsFormSubmissionService.recordAckResult(submissionId, sent ? "sent" : "failed");
  } catch (e) {
    console.error("[submitForm] thank-you failed:", e);
    await cmsFormSubmissionService.recordAckResult(submissionId, "failed").catch(() => undefined);
  }
}

/** Adapter for plain <form action={…}> markup (the existing ContactForm). */
export async function submitFormData(fd: FormData): Promise<SubmitFormResult> {
  const values: Record<string, unknown> = {};
  let formKey = "";
  let uploadToken: string | undefined;
  let hp: string | undefined;
  let t: number | undefined;
  let turnstileToken: string | undefined;
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) continue; // files travel via the upload route
    const s = String(v);
    if (k === "__formKey") formKey = s;
    else if (k === "__uploadToken") uploadToken = s;
    else if (k === "__hp" || k === "website") hp = s;
    else if (k === "__t") t = Number(s);
    else if (k === "cf-turnstile-response") turnstileToken = s;
    else values[k] = s;
  }
  return submitForm({ formKey, values, uploadToken, hp, t, turnstileToken });
}
