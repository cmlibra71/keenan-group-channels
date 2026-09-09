// ============================================================================
// The checkout exit survey — the pure half (card loDyEE3S).
//
// Tim, 2026-08-24: "If customers abandoned cart before leaving screen - As per
// Myer". Two things decide when the pop-up appears and what it carries, and
// both of them are here rather than in the component, because both are rules
// somebody will want to check without a browser.
//
// THE RULE THAT MATTERS MOST IS THE ONE THAT SAYS NO. This is a prompt, never
// a gate: nothing here delays, intercepts or cancels a navigation, and the
// survey may never be armed on a checkout that has been submitted. Under-firing
// is a nuisance; firing on somebody who has just paid is a defect.
// ============================================================================

import {
  CHECKOUT_SURVEY_EMAIL_FIELD,
  CHECKOUT_SURVEY_LIKELIHOOD_FIELD,
  CHECKOUT_SURVEY_LIKELIHOOD_SCALE,
  CHECKOUT_SURVEY_OTHER_FIELD,
  CHECKOUT_SURVEY_REASONS,
  CHECKOUT_SURVEY_REASON_FIELD,
  CHECKOUT_SURVEY_REASON_OTHER,
} from "@keenan/services/checkout-survey";

/** Per-tab memory: shown once, then never again in this session. */
export const EXIT_SURVEY_SESSION_KEY = "kg:checkout-survey:done";

/** The free-text box is capped at what the stored contract will keep. */
export const EXIT_SURVEY_OTHER_MAX_LENGTH = 500;

/**
 * The gap between the pop-up card and the edge of the window (`sm:p-6`).
 *
 * It is added to the card's own height when the page reserves room below the
 * checkout, so the last thing on the page clears the card rather than stopping
 * flush against it.
 */
export const EXIT_SURVEY_FRAME_GUTTER_PX = 24;

/**
 * Below this width the checkout is ONE column (`lg:grid-cols-5` in
 * CheckoutForm), so the Order Summary — the Total, Place Order and the sentence
 * saying why that button is disabled — is the last thing on the page and a
 * bottom-anchored card would sit on it with nothing left to scroll. That is the
 * only case the flow spacer exists for.
 *
 * At `lg` and above the summary is the RIGHT-hand column and the card is
 * bottom-LEFT, so nothing is covered and the spacer would only add up to 75vh
 * of dead page and jump the scrollbar the moment the pop-up opens.
 */
export const EXIT_SURVEY_TWO_COLUMN_MIN_PX = 1024;
export const EXIT_SURVEY_SINGLE_COLUMN_QUERY = `(max-width: ${EXIT_SURVEY_TWO_COLUMN_MIN_PX - 1}px)`;

/** True when the checkout is one column at this width, so the spacer is
 *  load-bearing. Unknown width (no `matchMedia`) reserves: covering the Total
 *  is the failure that matters, dead page is not. */
export function reservesFlowSpace(singleColumn: boolean | null): boolean {
  return singleColumn !== false;
}

/**
 * True when the pointer left through the TOP edge of the window — the browser's
 * only honest "they are reaching for the address bar, the back button or the
 * tab strip" signal.
 *
 * `relatedTarget` null is what separates leaving the WINDOW from moving between
 * two elements inside it; without it every hover over a form field would fire.
 */
export function isExitIntent(e: { clientY: number; relatedTarget: unknown }): boolean {
  return e.relatedTarget == null && e.clientY <= 0;
}

/**
 * How long the page has to have been out of sight before coming BACK to it
 * counts as "they moved to leave".
 *
 * There is no hover on a phone, so leaving-and-returning is the only honest
 * exit signal a touch device gives us. Left raw it also fires on somebody who
 * flicked to their banking app for a card number — mid-payment, which is the
 * worst moment we could pick. Twenty seconds is the line between fetching
 * something and having gone.
 */
export const EXIT_SURVEY_AWAY_MS = 20_000;

/** True when a return to the page reads as a return from LEAVING it. */
export function returnedFromLeaving(hiddenForMs: number): boolean {
  return hiddenForMs >= EXIT_SURVEY_AWAY_MS;
}

/**
 * Whether the pop-up may be armed at all.
 *
 * `submitted` is the load-bearing one: once Place Order has been pressed the
 * shopper is buying, or is inside Stripe's card confirmation, and the survey is
 * off for good — a completed checkout must never be asked why it was abandoned.
 * It stays off even if the order is refused, because "never on a completed
 * checkout" is worth more than a second chance at a survey.
 */
export function mayArmSurvey(state: {
  hasItems: boolean;
  submitted: boolean;
  alreadyDone: boolean;
}): boolean {
  return state.hasItems && !state.submitted && !state.alreadyDone;
}

export interface SurveyDraft {
  reason: string;
  other: string;
  likelihood: string;
}

export const EMPTY_SURVEY_DRAFT: SurveyDraft = { reason: "", other: "", likelihood: "" };

/** Where an answer is posted. A plain route, NOT a server action — see below. */
export const CHECKOUT_SURVEY_ENDPOINT = "/api/checkout-survey";

/**
 * Post the answers in a way that SURVIVES THE SHOPPER LEAVING, because leaving
 * is the whole event this survey is about.
 *
 * A server action is an ordinary `fetch`, and a browser cancels in-flight
 * fetches when the document goes away: it would land for somebody who merely
 * switched tabs and be dropped for somebody who closed the tab, pressed Back or
 * followed a link — the exact population the card is aimed at, and the one case
 * that would never show up in testing. `sendBeacon` is queued by the browser
 * and delivered after the page is gone; `keepalive` is the same guarantee on
 * `fetch` for anything without it (older Safari).
 *
 * Neither of them waits, blocks or delays the navigation — the rule this whole
 * component is arranged around still holds.
 */
export function sendSurveyDraft(draft: SurveyDraft): void {
  const body = JSON.stringify(draft);
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(CHECKOUT_SURVEY_ENDPOINT, blob)) return;
  } catch {
    // No sendBeacon, or it refused the payload — fall through to fetch.
  }
  try {
    void fetch(CHECKOUT_SURVEY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Nothing left to try. An answer is never worth an error on the way out.
  }
}

/**
 * The answers, keyed by the STORED contract's own field names, with everything
 * blank or unrecognised dropped.
 *
 * A value the contract does not list is dropped here rather than sent and
 * refused: the server rejects the whole submission on one bad option, and a
 * survey is not worth losing over a stale option list.
 *
 * The free-text box travels ONLY with "Other (please specify)" — text typed and
 * then abandoned by picking a different reason is not their answer.
 */
export function surveyAnswers(
  draft: SurveyDraft,
  email?: string | null
): Record<string, string> {
  const values: Record<string, string> = {};

  const reason = draft.reason.trim();
  if (CHECKOUT_SURVEY_REASONS.includes(reason)) values[CHECKOUT_SURVEY_REASON_FIELD] = reason;

  const other = draft.other.trim().slice(0, EXIT_SURVEY_OTHER_MAX_LENGTH);
  if (other && values[CHECKOUT_SURVEY_REASON_FIELD] === CHECKOUT_SURVEY_REASON_OTHER)
    values[CHECKOUT_SURVEY_OTHER_FIELD] = other;

  const likelihood = draft.likelihood.trim();
  if (CHECKOUT_SURVEY_LIKELIHOOD_SCALE.includes(likelihood))
    values[CHECKOUT_SURVEY_LIKELIHOOD_FIELD] = likelihood;

  const address = (email ?? "").trim();
  if (address) values[CHECKOUT_SURVEY_EMAIL_FIELD] = address;

  return values;
}

/**
 * True when there is something worth filing.
 *
 * The email alone is NOT an answer — it comes off the session, not off the
 * shopper, so a survey carrying only that is an empty enquiry with a name on it.
 */
export function hasSurveyAnswer(values: Record<string, string>): boolean {
  return Boolean(values[CHECKOUT_SURVEY_REASON_FIELD] || values[CHECKOUT_SURVEY_LIKELIHOOD_FIELD]);
}
