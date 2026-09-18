import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  announceCheckoutArmed,
  announceCheckoutLeft,
  bottomBarClearancePx,
  checkoutIsOnScreen,
  hasSurveyAnswer,
  isExitIntent,
  mayArmSurvey,
  reservesFlowSpace,
  returnedFromLeaving,
  surveyAnswers,
  CHECKOUT_ARMED_EVENT,
  CHECKOUT_LEFT_EVENT,
  CHECKOUT_SURVEY_ENDPOINT,
  EXIT_SURVEY_BOTTOM_BAR_MAX_FRACTION,
  EXIT_SURVEY_OTHER_MAX_LENGTH,
  EXIT_SURVEY_TWO_COLUMN_MIN_PX,
} from "./exit-survey";
import {
  CHECKOUT_SURVEY_EMAIL_FIELD,
  CHECKOUT_SURVEY_LIKELIHOOD_FIELD,
  CHECKOUT_SURVEY_OTHER_FIELD,
  CHECKOUT_SURVEY_REASON_FIELD,
  CHECKOUT_SURVEY_REASON_OTHER,
} from "@keenan/services/checkout-survey";

// ── When it may appear ──────────────────────────────────────────────────────

test("the pointer leaving through the top of the window is the exit signal", () => {
  assert.equal(isExitIntent({ clientY: -4, relatedTarget: null }), true);
  assert.equal(isExitIntent({ clientY: 0, relatedTarget: null }), true);
});

test("moving between two elements inside the page is not", () => {
  assert.equal(isExitIntent({ clientY: -4, relatedTarget: {} }), false);
  assert.equal(isExitIntent({ clientY: 300, relatedTarget: null }), false);
});

test("coming back after twenty seconds away is a return from leaving; a dash to the banking app is not", () => {
  assert.equal(returnedFromLeaving(20_000), true);
  assert.equal(returnedFromLeaving(60_000), true);
  assert.equal(returnedFromLeaving(4_000), false);
  assert.equal(returnedFromLeaving(0), false);
});

test("a submitted checkout is never asked why it was abandoned", () => {
  assert.equal(mayArmSurvey({ hasItems: true, submitted: true, alreadyDone: false }), false);
});

test("it is asked once per session, and never on an empty basket", () => {
  assert.equal(mayArmSurvey({ hasItems: true, submitted: false, alreadyDone: true }), false);
  assert.equal(mayArmSurvey({ hasItems: false, submitted: false, alreadyDone: false }), false);
  assert.equal(mayArmSurvey({ hasItems: true, submitted: false, alreadyDone: false }), true);
});

// ── What gets filed ─────────────────────────────────────────────────────────

test("a reason on its own is filed — closing after one answer keeps it", () => {
  const values = surveyAnswers(
    { reason: "Delivery cost too high", other: "", likelihood: "" },
    null
  );
  assert.deepEqual(values, { [CHECKOUT_SURVEY_REASON_FIELD]: "Delivery cost too high" });
  assert.equal(hasSurveyAnswer(values), true);
});

test("an option that is not on the stored list is dropped, not sent and refused", () => {
  const values = surveyAnswers({ reason: "Because", other: "", likelihood: "9" }, null);
  assert.deepEqual(values, {});
  assert.equal(hasSurveyAnswer(values), false);
});

test("the free-text box travels only with Other", () => {
  const other = surveyAnswers(
    { reason: CHECKOUT_SURVEY_REASON_OTHER, other: "  Freight was more than the goods  ", likelihood: "3" },
    null
  );
  assert.equal(other[CHECKOUT_SURVEY_OTHER_FIELD], "Freight was more than the goods");
  assert.equal(other[CHECKOUT_SURVEY_LIKELIHOOD_FIELD], "3");

  const changedTheirMind = surveyAnswers(
    { reason: "Not ready to buy yet", other: "typed then abandoned", likelihood: "" },
    null
  );
  assert.equal(changedTheirMind[CHECKOUT_SURVEY_OTHER_FIELD], undefined);
});

test("the free text is capped at what the stored contract will keep", () => {
  const values = surveyAnswers(
    { reason: CHECKOUT_SURVEY_REASON_OTHER, other: "x".repeat(900), likelihood: "" },
    null
  );
  assert.equal(values[CHECKOUT_SURVEY_OTHER_FIELD]?.length, EXIT_SURVEY_OTHER_MAX_LENGTH);
});

test("the email rides along but is never an answer on its own", () => {
  const withReason = surveyAnswers(
    { reason: "Not ready to buy yet", other: "", likelihood: "" },
    "chef@example.com"
  );
  assert.equal(withReason[CHECKOUT_SURVEY_EMAIL_FIELD], "chef@example.com");

  const emailOnly = surveyAnswers({ reason: "", other: "", likelihood: "" }, "chef@example.com");
  assert.equal(emailOnly[CHECKOUT_SURVEY_EMAIL_FIELD], "chef@example.com");
  assert.equal(hasSurveyAnswer(emailOnly), false);
});

// ── Where the card is allowed to sit ────────────────────────────────────────
//
// A source guard, in the spirit of `finance-offer-parity.test.ts`: the defect
// lives in a className, so no test of the pure functions above can see it.
//
// The Order Summary is the RIGHT-hand column of this checkout and it carries
// the Total, the Place Order / Pay Now button and the sentence saying why that
// button is disabled. The sf-checkout register's "Do not break" list (card
// 7vu2iEEZ) says that hint is the only thing telling a shopper why they cannot
// submit — so a pop-up that lands on it, with `pointer-events-auto`, is a gate
// wearing a prompt's clothes. It used to.

const component = readFileSync(
  new URL("../../components/checkout/CheckoutExitSurvey.tsx", import.meta.url),
  "utf8"
);

const frameClass =
  component.match(/className="(pointer-events-none fixed inset-0[^"]*)"/)?.[1] ?? "";

test("the pop-up frame keeps the card away from the Order Summary column", () => {
  assert.ok(frameClass, "could not find the pop-up frame's className");
  assert.ok(
    frameClass.includes("sm:justify-start"),
    "the card must sit bottom-LEFT from sm up — the Order Summary is the right-hand column"
  );
  assert.ok(
    !/justify-end/.test(frameClass),
    "justify-end puts the card over the Total, Place Order and its disabled hint"
  );
  assert.ok(
    frameClass.includes("pointer-events-none"),
    "the frame must not swallow clicks meant for the checkout behind it"
  );
});

test("the page reserves room below the checkout while the pop-up is open", () => {
  // While the checkout is ONE column the Order Summary is the LAST thing on the
  // page, so a bottom-anchored card would cover it with nothing left to scroll.
  // The spacer is what makes "the checkout stays usable behind it" true rather
  // than aspirational.
  assert.match(component, /aria-hidden style=\{\{ height: reserve \}\}/);
  assert.match(component, /el\.offsetHeight \+ EXIT_SURVEY_FRAME_GUTTER_PX/);
  // …and only there. Above `lg` the summary is the right-hand column, the card
  // is bottom-left, and a spacer would be up to 75vh of dead page plus a
  // scrollbar that jumps the moment the pop-up opens.
  assert.match(component, /EXIT_SURVEY_SINGLE_COLUMN_QUERY/);
  assert.match(component, /reservesFlowSpace\(/);
});

test("the spacer runs where it is load-bearing, and reserves when the width is unknown", () => {
  assert.equal(EXIT_SURVEY_TWO_COLUMN_MIN_PX, 1024, "CheckoutForm is `lg:grid-cols-5`");
  assert.equal(reservesFlowSpace(true), true, "one column — the summary is under the card");
  assert.equal(reservesFlowSpace(false), false, "two columns — the card is beside it");
  assert.equal(reservesFlowSpace(null), true, "no matchMedia: cover nothing, waste a little page");
});

// The card is no longer only ever seen on the checkout. It is mounted in the
// LAYOUT and asked on the page the shopper landed on — most often a product
// page, because the ordinary way into the checkout is the header cart drawer
// opened from one. That page carries a FIXED mobile buy bar below `lg`
// (`fixed inset-x-0 bottom-0 z-[90]`) holding the ex-GST price and Add to Cart,
// and those are rules card 33HGX8U2 put on `sf-product-page` ("it must work on
// phones — 60% of Industry Kitchens' shoppers are on one"). A `fixed` bar does
// not scroll, so the flow spacer above cannot clear it: the frame itself has to
// stop short of the bottom edge.

test("the card is lifted clear of a site's fixed bottom bar", () => {
  const vh = 844; // iPhone 14 Pro, the width the defect was measured at
  // Chefs Depot's mobile buy bar as it stands today: 77px, hard against the
  // bottom edge. 65px of it was covered by the card before this.
  assert.equal(bottomBarClearancePx([{ top: 767, bottom: 844 }], vh), 77);
  // A fractional rect still counts as pinned to the edge.
  assert.equal(bottomBarClearancePx([{ top: 766.5, bottom: 843.2 }], vh), 77);
  // Two bars: clear the tallest, not the sum.
  assert.equal(bottomBarClearancePx([{ top: 767, bottom: 844 }, { top: 800, bottom: 844 }], vh), 77);
});

test("only a bar pinned to the bottom edge moves the card, and only if it is a bar", () => {
  const vh = 844;
  // Nothing there — the checkout itself, and every width at `lg` and up, where
  // the buy bar is `lg:hidden` and measures zero.
  assert.equal(bottomBarClearancePx([], vh), 0);
  assert.equal(bottomBarClearancePx([{ top: 767, bottom: 767 }], vh), 0);
  // Floating mid-screen: covers nothing the card wants, so lifting would only
  // be dead space.
  assert.equal(bottomBarClearancePx([{ top: 400, bottom: 460 }], vh), 0);
  // A sheet or drawer, not a bar. Lifting by its height would push the
  // questionnaire off the top of the screen; the pop-up already sits UNDER the
  // mobile navigation drawer for the same reason.
  const sheet = { top: 844 - vh * EXIT_SURVEY_BOTTOM_BAR_MAX_FRACTION - 1, bottom: 844 };
  assert.equal(bottomBarClearancePx([sheet], vh), 0);
});

test("the pop-up measures that bar rather than hard-coding its height", () => {
  // A source guard, like the two above it: the bar is 77px on Chefs Depot
  // today, it is AUTHORED content in the `mobile_buy_bar` widget and in
  // Industry Kitchens' builder seed, and a magic number here would be wrong the
  // first time somebody changes its padding.
  assert.match(component, /measureBottomBar\(/);
  assert.match(component, /elementsFromPoint/);
  assert.match(component, /bottomBarClearancePx\(/);
  // …and the measurement has to actually reach the frame, or the card still
  // sits on the bar.
  assert.match(component, /style=\{barClear \? \{ bottom: barClear \} : undefined\}/);
  // The spacer clears both, so nothing at the bottom of a single-column page is
  // left unreachable either.
  assert.match(component, /EXIT_SURVEY_FRAME_GUTTER_PX \+ bar/);
});

test("nothing in the pop-up ever delays a navigation", () => {
  // The rule that outranks every other rule on this component. Matched against
  // the CODE, so the two comments that name `beforeunload` to say we do not use
  // it are not mistaken for a use of it.
  const code = component.replace(/\/\/[^\n]*/g, "");
  assert.ok(!/beforeunload/.test(code), "beforeunload would turn the prompt into a gate");
  assert.ok(!/preventDefault/.test(code), "nothing here may cancel a click or a key");
});

// ── An answer survives the shopper actually leaving ─────────────────────────
//
// The whole point of this survey is the person who goes. A server action is an
// ordinary `fetch`, and a browser CANCELS in-flight fetches when the document
// goes away — so the first build worked for somebody who switched tabs (which
// is what a CDP visibilitychange reproduces) and would have quietly dropped
// every answer from somebody who closed the tab, pressed Back or followed a
// link. `sendBeacon`/`keepalive` are the only transports that survive it.

test("an answer is posted with a transport that outlives the page", () => {
  const transport = readFileSync(new URL("./exit-survey.ts", import.meta.url), "utf8").replace(
    /\/\/[^\n]*/g,
    ""
  );
  assert.match(transport, /navigator\.sendBeacon/);
  assert.match(transport, /keepalive: true/);
  assert.equal(CHECKOUT_SURVEY_ENDPOINT, "/api/checkout-survey");
  assert.ok(
    !/submitCheckoutSurvey|lib\/actions\/checkout-survey/.test(component),
    "a server action would be cancelled by the departure this survey is about"
  );
});

test("nothing is ever filed against a checkout that was submitted", () => {
  // Open the pop-up, tick "Delivery cost too high", change your mind, press Pay,
  // then switch tabs while Stripe confirms the card: without this guard the page
  // going away files an abandonment reason against an order that was placed.
  const body = component.slice(component.indexOf("const file = useCallback"));
  const filing = body.slice(0, body.indexOf("}, []);"));
  assert.match(filing, /if \(submitted\.current\) return;/);
});

test("pressing Pay takes an already-open pop-up off the screen", () => {
  // `armed` only stops it OPENING. A shopper who had the questionnaire up,
  // changed their mind and pressed Pay would otherwise be left with it sitting
  // in front of — or behind — Stripe's card confirmation, which is the same
  // "never on a shopper who has just bought" rule seen from the other side.
  // Closing here files nothing: `file()` refuses once `submitted` is set.
  const handler = component.slice(component.indexOf("const onSubmitted = () => {"));
  const body = handler.slice(0, handler.indexOf("};"));
  assert.match(body, /submitted\.current = true;/);
  assert.match(body, /armed\.current = false;/);
  assert.match(body, /setOpen\(false\);/);
});

test("a press the checkout REFUSED is not a submit, so the survey stays armed", () => {
  // TT3DGpsE refuses a blank or half-typed card in the browser, before
  // `placeOrder` is called: the shopper places no order and is left on the
  // checkout. Watching raw `submit` events took the questionnaire away from
  // them for the rest of the session — silencing precisely the people whose
  // answer is "Issues processing payment" or "Technical issues with the site" —
  // and `defaultPrevented` cannot separate that from a real submit, because
  // React calls `preventDefault()` on every submit of a form with a function
  // `action`. So the FORM says when a press got past its guards, and that is
  // the only thing the survey listens for.
  assert.ok(
    !/addEventListener\("submit"/.test(component),
    "the survey must not listen for raw submit events"
  );
  assert.match(component, /addEventListener\(CHECKOUT_SUBMITTED_EVENT, onSubmitted\)/);

  const form = readFileSync(
    new URL("../../components/checkout/CheckoutForm.tsx", import.meta.url),
    "utf8"
  );
  const onSubmit = form.slice(form.indexOf("onSubmit={(event) => {"));
  const guard = onSubmit.slice(0, onSubmit.indexOf("announceCheckoutSubmitted()"));
  assert.ok(guard, "CheckoutForm must announce a real submit");
  assert.match(
    guard,
    /if \(cardSubmitBlocked\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;[\s\S]*?\}/,
    "the card refusal must return BEFORE the announcement"
  );
});

test("the survey endpoint refuses a body that is not one of ours", () => {
  const route = readFileSync(
    new URL("../../app/api/checkout-survey/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(route, /content-length/);
  assert.match(route, /EXIT_SURVEY_MAX_BODY_BYTES/);
  assert.ok(!/await request\.json\(\)/.test(route), "the body is read as text and bounded first");
});

// ── The Delivery card says what actually happened ───────────────────────────
//
// Another source guard, on the filing module. `notify_status` and `ack_status`
// both default to "pending" on the row and the enquiry screen renders them
// verbatim as "Staff email" and "Thank-you", so an unstamped row tells customer
// service, on every survey and for good, that two emails are still on their
// way. And the stamp has to be CONDITIONAL: this form ships with no recipients,
// but "adding a destination later is a settings change, not a rebuild" is a
// promise the register makes, so an unconditional `skipped` would make it a lie
// the day somebody sets one.

const filing = readFileSync(new URL("./checkout-survey.ts", import.meta.url), "utf8");

test("the destination is resolved, not assumed — a survey mails whoever the form names", () => {
  assert.match(filing, /resolveFormNotificationRecipients\(/);
  assert.match(filing, /if \(!to\.length\)[\s\S]{0,200}status: "skipped"/);
  assert.match(filing, /sendFormSubmissionStaffEmail\(/);
  assert.match(filing, /status: sent \? "sent" : "failed"/);
});

test("the thank-you is stamped from the form's own setting, not from a guess", () => {
  assert.match(filing, /form\.notify_submitter === false/);
  assert.match(filing, /recordAckResult\(submissionId, "skipped"\)/);
});

test("filing still cannot throw at a shopper on their way out", () => {
  const code = filing.replace(/\/\/[^\n]*/g, "");
  assert.match(code, /catch \(e\) \{[\s\S]*?return \{ stored: false \};/);
});

// ── Leaving the checkout by an ordinary route ───────────────────────────────
//
// Steve, 2026-09-17: "I can see no evidence of this on either website. It does
// not pop up anywhere when I go to leave from inside the checkout." He was
// right. The two original triggers were the pointer crossing the TOP edge of
// the window and coming back after twenty seconds away — neither of which is
// anything an ordinary departure does. Pressing Back, clicking a link or a
// router move fired nothing at all, and Tim's words on the card are "If
// customers abandoned cart before leaving screen".
//
// So the pop-up moved into the site LAYOUT, where it outlives the checkout
// page, and the checkout renders a marker whose UNMOUNT is the departure. The
// question is asked AFTER the navigation, on the page the shopper landed on,
// which is the only way to ask it without holding anybody up.

const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const checkoutPage = readFileSync(new URL("../../app/checkout/page.tsx", import.meta.url), "utf8");
const marker = readFileSync(
  new URL("../../components/checkout/CheckoutExitSurveyArm.tsx", import.meta.url),
  "utf8"
);

test("the pop-up is mounted where it survives a route change", () => {
  // On the checkout page it was unmounted by the very navigation it exists to
  // ask about, which is why Back and a link click produced nothing at all.
  assert.match(layout, /<CheckoutExitSurvey \/>/);
  assert.match(layout, /from "@\/components\/checkout\/CheckoutExitSurvey"/);
  assert.ok(
    !/<CheckoutExitSurvey \/>/.test(checkoutPage),
    "the checkout page must render the marker, not the pop-up it would unmount"
  );
});

test("only a real checkout arms it, so the layout mount stays silent everywhere else", () => {
  // The marker sits past the empty-cart redirect and past the sign-in gate, and
  // the confirmation page does not render it at all.
  assert.match(checkoutPage, /<CheckoutExitSurveyArm \/>/);
  assert.match(marker, /announceCheckoutArmed\(\)/);
  assert.match(marker, /return \(\) => announceCheckoutLeft\(\)/);
  assert.match(component, /if \(checkoutIsOnScreen\(\)\) \{\n\s*onArmed\(\);/);
  assert.match(component, /addEventListener\(CHECKOUT_ARMED_EVENT, onArmed\)/);
  assert.match(component, /addEventListener\(CHECKOUT_LEFT_EVENT, onLeft\)/);
});

test("a departure that reloads the document is asked on the page they land on", () => {
  // The other half of leaving, and the half a browser Back takes whenever the
  // checkout was reached by a hard page load: the document is torn down, React
  // unmounts nothing, and the next page is a fresh document with no memory. The
  // tab keeps one, so the pop-up mounting anywhere else can still ask.
  assert.match(component, /window\.sessionStorage\.setItem\(EXIT_SURVEY_ARMED_KEY, "1"\)/);
  assert.match(component, /getItem\(EXIT_SURVEY_ARMED_KEY\) === "1"/);
  assert.match(component, /removeItem\(EXIT_SURVEY_ARMED_KEY\)/);
  // …and it is asked ONCE: the flag is dropped when the question goes up, and a
  // submitted checkout drops it too rather than asking on the confirmation page.
  const shown = component.slice(component.indexOf("const show = () => {"));
  assert.match(shown.slice(0, shown.indexOf("};")), /forget\(\);/);
  const submitHandler = component.slice(component.indexOf("const onSubmitted = () => {"));
  assert.match(submitHandler.slice(0, submitHandler.indexOf("};")), /forget\(\);/);
});

test("the two on-page triggers stay on the page they are about", () => {
  // Exit intent and the return-from-away ask somebody who is STILL on the
  // checkout. With the pop-up now mounted site-wide they have to say so, or a
  // stale arm would put the questionnaire on an unrelated page.
  const mouse = component.slice(component.indexOf("const onMouseOut = "));
  assert.match(mouse.slice(0, mouse.indexOf("};")), /if \(!onCheckout\.current\) return;/);
  assert.match(component, /onCheckout\.current && hiddenAt && returnedFromLeaving/);
});

test("a page that is going away files what was answered, and asks nothing", () => {
  // Closing the tab or typing an address runs no React unmount, so there is no
  // departure event and no page left to ask on. `pagehide` is the event that
  // fires for all of those; it FILES and returns, and it is not `beforeunload`.
  assert.match(component, /const onPageHide = \(\) => file\(\);/);
  assert.match(component, /addEventListener\("pagehide", onPageHide\)/);
  assert.match(component, /removeEventListener\("pagehide", onPageHide\)/);
});

test("nothing in the marker delays a navigation either", () => {
  const code = marker.replace(/\/\/[^\n]*/g, "");
  assert.ok(!/beforeunload/.test(code), "beforeunload would turn the prompt into a gate");
  assert.ok(!/preventDefault/.test(code), "nothing here may cancel a click");
  assert.ok(
    !/history\.|pushState|router\./.test(code),
    "no history trap: the back button must work first time, every time"
  );
});

test("a React remount of the checkout is not a departure", async () => {
  // Strict Mode unmounts and immediately remounts every component in
  // development, and a key change or a Suspense retry does it anywhere. Read
  // naively that is "the shopper left the checkout", and the questionnaire
  // would open on top of the checkout itself on first load.
  const target = new EventTarget();
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = target;
  try {
    let departures = 0;
    let armings = 0;
    target.addEventListener(CHECKOUT_LEFT_EVENT, () => departures++);
    target.addEventListener(CHECKOUT_ARMED_EVENT, () => armings++);

    announceCheckoutArmed();
    announceCheckoutLeft();
    announceCheckoutArmed();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(departures, 0, "a remount must not read as leaving the checkout");
    assert.equal(armings, 2);
    assert.equal(checkoutIsOnScreen(), true);

    announceCheckoutLeft();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(departures, 1, "actually leaving is announced once");
    assert.equal(checkoutIsOnScreen(), false);
  } finally {
    (globalThis as { document?: unknown }).document = previous;
  }
});
