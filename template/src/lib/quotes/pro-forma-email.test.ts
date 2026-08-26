import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The pro-forma is the ONLY email a storefront acceptance sends the customer.
 *
 * `acceptQuote` tells the portal's acceptance follow-up `customerAlreadyNotified`, so no
 * confirmation is sent beside it. While this file used its own bare `SESClient`, that meant an
 * acceptance made in the account area produced: no row on the quote's Emails card, no row on the
 * person's history, no SES configuration set (so the send could never report Delivered or
 * Bounced) and no test-safety redirect. Steve, 2026-08-26, on QU:00227 — "the Quote History is
 * definitely being recorded, but the Emails Sent area is not capturing any information".
 *
 * A source assertion rather than a mocked send, for the same reason the worker's deploy-env test
 * is one: the failure mode is a sender quietly reaching for its own client again, and that is
 * visible in the file. Running the real send here would need SES.
 */
const SOURCE = readFileSync(fileURLToPath(new URL("./pro-forma-email.ts", import.meta.url)), "utf-8");

test("the pro-forma goes through the shared SES wrapper, never its own client", () => {
  assert.match(SOURCE, /await safeSesSend\(/, "the pro-forma must send through safeSesSend");
  assert.doesNotMatch(
    SOURCE,
    /new SESClient\(/,
    "a private SES client escapes the trail, the configuration set and the test-safety guard"
  );
  assert.doesNotMatch(SOURCE, /sesClient\.send\(/, "no bare client send may remain");
});

test("the send names the quote and the email, so both trails can carry it", () => {
  assert.match(SOURCE, /emailKind: "quote_proforma"/, "without a kind neither trail records the send");
  assert.match(SOURCE, /quoteId: quote\.id/, "without the quote id the Emails card cannot show it");
  assert.match(SOURCE, /channelId: CHANNEL_ID/, "the person is matched on their own site's contact row");
});

test("the test-safety redirect is the wrapper's job, not a second copy here", () => {
  assert.doesNotMatch(
    SOURCE,
    /process\.env\.EMAIL_GLOBAL_REDIRECT/,
    "resolveTestRedirect inside safeSesSend is the one place the test-safety rule lives"
  );
  assert.match(SOURCE, /testMode:/, "a quote in payments test mode must not mail a real customer");
});
