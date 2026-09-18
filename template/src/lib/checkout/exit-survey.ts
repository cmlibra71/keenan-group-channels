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

/**
 * Per-tab memory of the other half: "a checkout was armed in this tab".
 *
 * A departure comes in two shapes and only one of them runs React code. An
 * in-page navigation (Back within the app, a link, a router move) unmounts the
 * checkout's marker, and that unmount is the signal. A FULL-page departure —
 * Back across a hard page load, a typed address, a hard link — tears the whole
 * document down without unmounting anything, so the next page is a fresh
 * document with no memory at all.
 *
 * This is that memory. The pop-up, mounting on the page they landed on, sees
 * the flag with no checkout on screen and knows the shopper left one. Cleared
 * the moment the question is asked, and irrelevant once the checkout is
 * submitted, because that stamps `EXIT_SURVEY_SESSION_KEY` instead.
 */
export const EXIT_SURVEY_ARMED_KEY = "kg:checkout-survey:armed";

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
 * How close to the bottom edge of the window a fixed element has to finish
 * before it counts as a bar PINNED there rather than something that merely
 * happens to be low on the page. Sub-pixel layout means an exact comparison
 * misses by fractions.
 */
export const EXIT_SURVEY_BOTTOM_BAR_TOLERANCE_PX = 2;

/**
 * A bar taller than this share of the window is not a bar — it is a sheet, a
 * drawer or a full-screen overlay, and lifting the card by its height would
 * push the questionnaire off the top of the screen. Left uncleared instead:
 * those are screens the shopper opened on purpose and the pop-up already sits
 * under the mobile navigation drawer for the same reason.
 */
export const EXIT_SURVEY_BOTTOM_BAR_MAX_FRACTION = 0.4;

/**
 * How far the pop-up must be lifted off the bottom of the window so it clears
 * the SITE's own fixed bottom bar.
 *
 * The pop-up is mounted in the layout, so it is no longer only ever seen on the
 * checkout: it appears on whatever page the departing shopper lands on, and the
 * most ordinary route into the checkout is the header cart drawer opened from a
 * product page — so Back lands them on `/products/[slug]`, which carries a
 * FIXED mobile buy bar below `lg` (`fixed inset-x-0 bottom-0 z-[90]`, Chefs
 * Depot's `ProductDetail` and `mobile_buy_bar` widget, Industry Kitchens'
 * builder seed). That bar carries the ex-GST price and Add to Cart, both
 * rule-bearing on `sf-product-page` (card 33HGX8U2, Steve 2026-08-05: it must
 * work on phones, 60% of Industry Kitchens' shoppers are on one). A bottom-
 * anchored card lands on top of it, and — unlike the checkout's Order Summary —
 * a `fixed` bar does not scroll, so the flow spacer cannot rescue it.
 *
 * Measured, never assumed: the bar is 77px on Chefs Depot today, it is authored
 * content on Industry Kitchens, and a magic number here would be wrong the day
 * somebody changes its padding.
 */
export function bottomBarClearancePx(
  bars: ReadonlyArray<{ top: number; bottom: number }>,
  viewportHeight: number
): number {
  let clearance = 0;
  for (const bar of bars) {
    const height = bar.bottom - bar.top;
    if (!(height > 0)) continue;
    // Anchored to the bottom EDGE. A fixed element floating mid-screen covers
    // nothing the card wants and lifting for it would be dead space.
    if (bar.bottom < viewportHeight - EXIT_SURVEY_BOTTOM_BAR_TOLERANCE_PX) continue;
    if (height > viewportHeight * EXIT_SURVEY_BOTTOM_BAR_MAX_FRACTION) continue;
    clearance = Math.max(clearance, Math.ceil(height));
  }
  return clearance;
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
 * The checkout telling the page that an order really is being PLACED.
 *
 * The survey used to watch for any `submit` event on the document in the
 * capture phase, which looked robust and was not: a press of Place Order that
 * the checkout REFUSES still fires a submit. A blank or half-typed card is
 * refused in the browser before `placeOrder` is ever called (card TT3DGpsE),
 * and `defaultPrevented` cannot tell the two apart — React calls
 * `preventDefault()` itself on every submit of a form with a function `action`.
 * So a shopper whose card would not go through placed no order, was left on the
 * checkout, and had the survey silenced for the rest of the session — silencing
 * exactly the people whose answer is "Issues processing payment" or "Technical
 * issues with the site".
 *
 * The checkout form therefore SAYS when a press got past its own guards, and
 * that is the only thing the survey listens for. There is one form on this page
 * and this is dispatched from its `onSubmit`, so it still covers a card
 * confirmation, which submits through the same form.
 */
export const CHECKOUT_SUBMITTED_EVENT = "kg:checkout-submitted";

/** Announce it. Never allowed to throw: nothing here may cost an order. */
export function announceCheckoutSubmitted(): void {
  try {
    document.dispatchEvent(new Event(CHECKOUT_SUBMITTED_EVENT));
  } catch {
    /* A page with no document, or a browser refusing the constructor. The
       survey merely stays armed; the order is unaffected. */
  }
}

/**
 * The checkout page saying it is on screen, and — when that announcement is
 * withdrawn — that the shopper has just LEFT it by an ordinary in-page route.
 *
 * Steve, 2026-09-17: "I can see no evidence of this on either website. It does
 * not pop up anywhere when I go to leave from inside the checkout." He was
 * right, and the reason is that the two original triggers are both things an
 * ordinary departure does not do: the pointer crossing the TOP edge of the
 * window, and coming back after twenty seconds away. Pressing Back, clicking a
 * link or letting the router move fired neither. Tim's words on the card are
 * "If customers abandoned cart before leaving screen", so leaving the screen is
 * the trigger, however they leave it.
 *
 * THE POP-UP THEREFORE OUTLIVES THE CHECKOUT PAGE. It is mounted in the site
 * layout and the checkout renders a marker (`CheckoutExitSurveyArm`); the
 * marker's mount is what ARMS the survey and the marker's unmount is the
 * departure. That is the only way to ask without breaking the rule that
 * outranks everything here — a question asked BEFORE the navigation would have
 * to hold the navigation up, and this one is asked after it has already
 * happened, on the page the shopper landed on.
 */
export const CHECKOUT_ARMED_EVENT = "kg:checkout-armed";
export const CHECKOUT_LEFT_EVENT = "kg:checkout-left";

/**
 * A React REMOUNT is an unmount immediately followed by a mount — which is what
 * Strict Mode does to every component in development, and what a key change or
 * a Suspense retry does anywhere. Announcing the departure synchronously would
 * turn that into "the shopper left the checkout" and pop the questionnaire up
 * on top of the checkout itself, on first load, in dev.
 *
 * So the departure is announced a turn of the event loop later and cancelled if
 * a checkout marker mounts in the meantime. Nothing waits on this timer: it
 * delays only the QUESTION, never the navigation, which has already happened.
 */
export const EXIT_SURVEY_LEAVE_SETTLE_MS = 0;

let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let checkoutOnScreen = false;

/**
 * Whether a priced checkout is on screen right now.
 *
 * Read once by the pop-up when it mounts, because React runs a CHILD's effects
 * before its parent's: on a full page load of /checkout the marker announces
 * itself before the layout-level pop-up has subscribed, so the event alone
 * would be missed.
 */
export function checkoutIsOnScreen(): boolean {
  return checkoutOnScreen;
}

/** The checkout is on screen. Cancels a pending departure (see above). */
export function announceCheckoutArmed(): void {
  if (leaveTimer !== null) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  checkoutOnScreen = true;
  try {
    document.dispatchEvent(new Event(CHECKOUT_ARMED_EVENT));
  } catch {
    /* No document, or a browser refusing the constructor. The survey simply
       never arms; nothing else on the checkout is affected. */
  }
}

/** The checkout page has gone. Never allowed to throw, and never to block. */
export function announceCheckoutLeft(): void {
  if (leaveTimer !== null) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    checkoutOnScreen = false;
    try {
      document.dispatchEvent(new Event(CHECKOUT_LEFT_EVENT));
    } catch {
      /* see above */
    }
  }, EXIT_SURVEY_LEAVE_SETTLE_MS);
}

/** The biggest body the survey endpoint will look at. Three short answers and
 *  a 500-character free-text box; anything larger is not one of ours. */
export const EXIT_SURVEY_MAX_BODY_BYTES = 4096;

/**
 * Whether the pop-up may be armed at all.
 *
 * `submitted` is the load-bearing one: once a press of Place Order has got past
 * the checkout's own guards the shopper is buying, or is inside Stripe's card
 * confirmation, and the survey is off for good — a completed checkout must never
 * be asked why it was abandoned. It stays off even if the ORDER is then refused
 * (by the server, by the bank), because "never on a checkout that was really
 * submitted" is worth more than a second chance at a survey. A press the page
 * itself refused before `placeOrder` — a half-typed card — is NOT a submit and
 * does not set this: see `CHECKOUT_SUBMITTED_EVENT`.
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
