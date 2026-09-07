import test from "node:test";
import assert from "node:assert/strict";
import {
  hasSurveyAnswer,
  isExitIntent,
  mayArmSurvey,
  returnedFromLeaving,
  surveyAnswers,
  EXIT_SURVEY_OTHER_MAX_LENGTH,
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
