// ============================================================================
// The checkout exit survey's submit endpoint (card loDyEE3S).
//
// A ROUTE, DELIBERATELY, NOT A SERVER ACTION. The answer this survey most wants
// is the one from a shopper who is actually leaving — closing the tab, pressing
// Back, following a link — and a browser CANCELS in-flight fetches when the
// document goes away. A server action is an ordinary fetch, so it would have
// landed for somebody who merely switched tabs and been silently dropped for
// the very population the card is about. `navigator.sendBeacon` (and `fetch`
// with `keepalive`) survive that, and both need a plain URL to post to.
//
// Public and unauthenticated, like every other storefront form path, so it
// carries the same per-IP sliding windows `submitForm` does.
//
// The email is read from the SESSION here, never taken from the request body.
// It is what links an answer to the customer's own record in the portal; a
// posted address would let anyone file an enquiry against anybody.
//
// ALWAYS 204, whatever happened. A beacon cannot read a response and the
// shopper is on their way out; a status code here would only tell a prober
// which addresses are signed in and whether the rate limit had bitten.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { fileCheckoutSurvey } from "@/lib/checkout/checkout-survey";
import { hasSurveyAnswer, surveyAnswers } from "@/lib/checkout/exit-survey";

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  const h = request.headers;
  const ip =
    (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || "unknown";
  if (
    !slidingWindowAllow(`checkout-survey:${ip}`, { windowMs: 60_000, max: 3 }) ||
    !slidingWindowAllow(`checkout-survey-hr:${ip}`, { windowMs: 3_600_000, max: 20 })
  )
    return NO_CONTENT();

  let draft: Record<string, unknown> = {};
  try {
    draft = (await request.json()) as Record<string, unknown>;
  } catch {
    return NO_CONTENT();
  }
  if (!draft || typeof draft !== "object") return NO_CONTENT();

  const session = await getSession().catch(() => null);
  const values = surveyAnswers(
    {
      reason: String(draft.reason ?? ""),
      other: String(draft.other ?? ""),
      likelihood: String(draft.likelihood ?? ""),
    },
    session?.email ?? null
  );
  // The email alone is not an answer, so a survey carrying only a session
  // address files nothing.
  if (!hasSurveyAnswer(values)) return NO_CONTENT();

  await fileCheckoutSurvey(values).catch(() => undefined);
  return NO_CONTENT();
}
