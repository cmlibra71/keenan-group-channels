// ============================================================================
// Filing a finance application placed with an order (card VAjaPj0t).
//
// THE SUBMISSION ROW IS THE SYSTEM OF RECORD — the same contract the builder
// forms already work to (lib/actions/forms.ts). It lands in the portal's
// enquiries list alongside every other form, carrying the order number, so
// staff can see which order the finance is for.
//
// Then the rep is told. Tim, 2026-08-11: the assigned sales rep is informed of
// each application; with nobody assigned it goes to cs@ the storefront's own
// domain — the same ladder (and the same live mailboxes) the quote change
// request uses.
//
// NOTHING HERE MAY THROW. The order already exists and is placed unpaid by the
// time this runs; a failed insert or a failed SES call must never take the
// order with it. The caller stamps the outcome onto the order instead, and the
// staff email carries every answer, so an application is never silently lost.
// ============================================================================

import {
  accountSalesRepAssignmentService,
  channelSettingsService,
  cmsFormSubmissionService,
  ensureFinanceApplicationForm,
  financeApplicationFields,
  formatFinanceMoney,
  resolveFinanceApplicationRecipients,
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_APPLICATION_FORM_NAME,
} from "@keenan/services/services";
import { resolveEmailBranding, sendFormSubmissionStaffEmail } from "@keenan/services";
import { CHANNEL_ID, getSiteConfig } from "@/lib/store";

const PORTAL_URL = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "");

export interface FinanceApplicationResult {
  /** The stored submission, or null when it could not be persisted. */
  submissionUuid: string | null;
  /** Who was emailed about it. */
  notified: string[];
  /** Set when the submission could not be stored — stamped on the order. */
  error?: string;
}

export async function fileFinanceApplication(input: {
  /** The order this application was placed with — ABSENT when the customer
   *  applied from the SilverChef page instead of the checkout (card 6f47rFeT).
   *  Everything else is identical: same stored form, same rep-else-cs@ ladder,
   *  same staff email, so an application can only be filed one way. */
  orderId?: number | null;
  orderNumber?: string | null;
  /** Where they applied from, for the submission row. Defaults to the checkout. */
  pagePath?: string;
  /** "silverchef" | "finance" — which button they pressed. */
  paymentMethod: string;
  /** Answers keyed by the form's own field names. */
  values: Record<string, string>;
  /** Claims the licence / Medicare photos uploaded before submit. */
  uploadToken?: string | null;
  /** The buyer's B2B account, when they have one — decides which rep is told. */
  accountId?: number | null;
  /** The order's contact email — staff reply straight to it. */
  replyTo?: string | null;
  /** The weekly figure shown on the button the customer pressed, for the staff email. */
  weeklyAmount?: number;
  testMode?: boolean;
}): Promise<FinanceApplicationResult> {
  const pagePath = input.pagePath ?? "/checkout";
  // `order_number` is ours (it links the application to the order it was placed
  // with). An application made from the SilverChef page has no order yet, and
  // an empty answer would read as a lost order number on the enquiry.
  const payload = input.orderNumber
    ? { ...input.values, order_number: input.orderNumber }
    : { ...input.values };

  let submission: Record<string, unknown> | null = null;
  let files: Record<string, unknown>[] = [];
  let error: string | undefined;
  try {
    await ensureFinanceApplicationForm(CHANNEL_ID);
    const created = (await cmsFormSubmissionService.createFromStorefront({
      formKey: FINANCE_APPLICATION_FORM_KEY,
      channelId: CHANNEL_ID,
      values: payload,
      uploadToken: input.uploadToken ?? null,
      pagePath,
    })) as { submission: Record<string, unknown>; files: Record<string, unknown>[] };
    submission = created.submission;
    files = created.files ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown";
    console.error(
      `[finance] application NOT stored${input.orderNumber ? ` for order ${input.orderNumber}` : ""}:`,
      e
    );
  }

  // Rep first, cs@ second — resolved even when the submission failed, because
  // the email is then the only copy of the application.
  let repEmails: string[] = [];
  if (input.accountId) {
    try {
      const reps = (await accountSalesRepAssignmentService.getSalesRepsForAccount(
        input.accountId
      )) as { rep_email?: string | null; is_primary?: boolean | null }[];
      repEmails = [...reps]
        .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))
        .map((r) => r.rep_email ?? null)
        .filter((e): e is string => !!e);
    } catch (e) {
      console.error("[finance] rep lookup failed (falling back to cs@):", e);
    }
  }

  const csEmail = await channelSettingsService
    .getByKey(CHANNEL_ID, "cs_email")
    .then((s) => (s as { setting_value?: unknown } | null)?.setting_value)
    .catch(() => null);
  const site = await getSiteConfig().catch(() => null);

  const { emails } = resolveFinanceApplicationRecipients({
    repEmails,
    csEmail: typeof csEmail === "string" ? csEmail : null,
    siteUrl: site?.site?.url ?? null,
  });

  if (!emails.length) {
    if (submission)
      await cmsFormSubmissionService
        .recordNotifyResult(submission.id as number, { status: "skipped" })
        .catch(() => undefined);
    return { submissionUuid: submission ? String(submission.uuid) : null, notified: [], error };
  }

  const fieldDefs = financeApplicationFields();
  const lines = [
    {
      label: "Payment method",
      value: input.paymentMethod === "silverchef" ? "SilverChef" : "Finance",
    },
    // The figure the CUSTOMER was shown, under the label they were shown it
    // under. SilverChef and SKOPE are two offers at two rates (card VAjaPj0t) —
    // printing a SKOPE figure as "Rent per Week" in the staff email would make
    // the rep quote a SilverChef rent SilverChef never offered.
    ...(input.weeklyAmount
      ? [
          {
            label: input.paymentMethod === "silverchef" ? "Rent per Week" : "Weekly (Skope Funding)",
            value: formatFinanceMoney(input.weeklyAmount),
          },
        ]
      : []),
    ...Object.entries(payload).map(([name, value]) => ({
      label: fieldDefs.find((f) => f.name === name)?.label ?? name,
      value: String(value ?? ""),
    })),
    ...(error ? [{ label: "Note", value: "This application could not be filed — this email is the only copy." }] : []),
  ];

  try {
    const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
    const sent = await sendFormSubmissionStaffEmail({
      to: emails,
      formName: input.orderNumber
        ? `${FINANCE_APPLICATION_FORM_NAME} — order ${input.orderNumber}`
        : FINANCE_APPLICATION_FORM_NAME,
      // The enquiry is where an application is read. With no submission row AND
      // no order there is nothing in the portal to point at, so the email is the
      // whole record and carries every answer (see `lines` above).
      submissionUrl: submission
        ? `${PORTAL_URL}/dashboard/enquiries/${submission.uuid}`
        : input.orderId
          ? `${PORTAL_URL}/dashboard/orders/${input.orderId}`
          : `${PORTAL_URL}/dashboard/enquiries`,
      fields: lines,
      attachments: files.length
        ? files.map((f) => ({ fileName: String(f.file_name ?? "attachment") }))
        : undefined,
      replyTo: input.replyTo ?? null,
      branding,
      pagePath,
      testMode: input.testMode,
    });
    if (submission)
      await cmsFormSubmissionService
        .recordNotifyResult(submission.id as number, {
          status: sent ? "sent" : "failed",
          emails,
          error: sent ? null : "SES send returned false",
        })
        .catch(() => undefined);
    return {
      submissionUuid: submission ? String(submission.uuid) : null,
      notified: sent ? emails : [],
      error,
    };
  } catch (e) {
    console.error("[finance] application notification failed (non-fatal):", e);
    if (submission)
      await cmsFormSubmissionService
        .recordNotifyResult(submission.id as number, {
          status: "failed",
          error: e instanceof Error ? e.message : "unknown",
        })
        .catch(() => undefined);
    return { submissionUuid: submission ? String(submission.uuid) : null, notified: [], error };
  }
}
