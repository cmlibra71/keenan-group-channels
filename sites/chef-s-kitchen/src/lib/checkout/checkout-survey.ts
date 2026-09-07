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
    await cmsFormSubmissionService
      .recordNotifyResult(created.submission.id as number, { status: "skipped" })
      .catch(() => undefined);

    return { stored: true };
  } catch (e) {
    console.error("[checkout-survey] answer NOT stored:", e);
    return { stored: false };
  }
}
