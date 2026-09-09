// ============================================================================
// Filing a checkout exit survey (card loDyEE3S).
//
// THE SUBMISSION ROW IS THE SYSTEM OF RECORD — the same contract every builder
// form works to (lib/actions/forms.ts) and the same one the finance application
// uses (lib/checkout/finance-application.ts). The answers land in the portal's
// enquiries list, which is where Steve's question ("where do you want this
// sent to? Or do you want the survey results collected inside the platform?")
// is answered for now: inside the platform. NOBODY IS EMAILED. A staff alert
// per abandoned basket would be noise nobody asked for, and adding a
// destination later is a settings change on the form, not a rebuild — so the
// row is stamped `skipped` rather than left reading "pending" forever on the
// enquiry screen.
//
// NOTHING HERE MAY THROW. The shopper is mid-navigation with a modal in front
// of them; a failed insert must cost them nothing but the answer.
// ============================================================================

import {
  cmsFormSubmissionService,
  ensureCheckoutSurveyForm,
  CHECKOUT_SURVEY_FORM_KEY,
} from "@keenan/services/services";
import { CHANNEL_ID } from "@/lib/store";

export async function fileCheckoutSurvey(
  values: Record<string, string>
): Promise<{ stored: boolean }> {
  try {
    await ensureCheckoutSurveyForm(CHANNEL_ID);
    const created = (await cmsFormSubmissionService.createFromStorefront({
      formKey: CHECKOUT_SURVEY_FORM_KEY,
      channelId: CHANNEL_ID,
      values,
      pagePath: "/checkout",
    })) as { submission: Record<string, unknown> };

    // No recipients by design (see the header). Saying so is what keeps the
    // enquiry's Delivery card honest and its "Resend notification" button off
    // a form that has nowhere to send.
    //
    // BOTH halves of that card are stamped. The staff email was never going to
    // be sent (no recipients) and neither was the thank-you (`notifySubmitter`
    // is false on this form — a shopper mid-abandonment is the last person who
    // wants "thanks for your message"), so leaving either at the default
    // "pending" would leave the Delivery card promising mail that is never
    // coming, on every survey row, for good.
    const id = created.submission.id as number;
    await Promise.all([
      cmsFormSubmissionService
        .recordNotifyResult(id, { status: "skipped" })
        .catch(() => undefined),
      cmsFormSubmissionService.recordAckResult(id, "skipped").catch(() => undefined),
    ]);

    return { stored: true };
  } catch (e) {
    console.error("[checkout-survey] answer NOT stored:", e);
    return { stored: false };
  }
}
