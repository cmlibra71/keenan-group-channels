import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasSurveyAnswer,
  isExitIntent,
  mayArmSurvey,
  reservesFlowSpace,
  returnedFromLeaving,
  surveyAnswers,
  CHECKOUT_SURVEY_ENDPOINT,
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
  const handler = component.slice(component.indexOf("const onSubmit = () => {"));
  const body = handler.slice(0, handler.indexOf("};"));
  assert.match(body, /submitted\.current = true;/);
  assert.match(body, /armed\.current = false;/);
  assert.match(body, /setOpen\(false\);/);
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
