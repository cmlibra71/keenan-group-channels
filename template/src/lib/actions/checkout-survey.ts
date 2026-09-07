"use server";

// The checkout exit survey's submit path (card loDyEE3S).
//
// Public and unauthenticated, like every other storefront form action, so it
// carries the same per-IP sliding windows `submitForm` does. It deliberately
// does NOT go through `submitForm`: that resolves the form's generic
// destinations and would mail staff about every abandoned basket, which is
// exactly what this survey is not for.
//
// The email is read from the SESSION here, never taken from the client. It is
// what links an answer to the customer's own record in the portal; a posted
// address would let anyone file an enquiry against anybody.

import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { fileCheckoutSurvey } from "@/lib/checkout/checkout-survey";
import {
  hasSurveyAnswer,
  surveyAnswers,
  type SurveyDraft,
} from "@/lib/checkout/exit-survey";

export async function submitCheckoutSurvey(draft: SurveyDraft): Promise<{ stored: boolean }> {
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || "unknown";
  if (
    !slidingWindowAllow(`checkout-survey:${ip}`, { windowMs: 60_000, max: 3 }) ||
    !slidingWindowAllow(`checkout-survey-hr:${ip}`, { windowMs: 3_600_000, max: 20 })
  )
    return { stored: false };

  const session = await getSession().catch(() => null);
  const values = surveyAnswers(
    {
      reason: String(draft?.reason ?? ""),
      other: String(draft?.other ?? ""),
      likelihood: String(draft?.likelihood ?? ""),
    },
    session?.email ?? null
  );
  if (!hasSurveyAnswer(values)) return { stored: false };

  return fileCheckoutSurvey(values);
}
