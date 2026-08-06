import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteStatusLabel, KNOWN_QUOTE_STATUSES } from "./quote-status-label.ts";

test("every lifecycle status reads in the portal's exact words", () => {
  assert.equal(quoteStatusLabel("created"), "Created");
  assert.equal(quoteStatusLabel("quote_pending"), "Quote Pending");
  assert.equal(quoteStatusLabel("quote_available"), "Quote Available");
  assert.equal(quoteStatusLabel("open_change_request"), "Open, Change Request");
  assert.equal(quoteStatusLabel("quote_accepted"), "Quote Accepted");
  assert.equal(quoteStatusLabel("quote_on_hold"), "On Hold");
  assert.equal(quoteStatusLabel("converted_to_order"), "Converted to Order");
  assert.equal(quoteStatusLabel("quote_expired"), "Quote Expired");
  assert.equal(quoteStatusLabel("quote_cancelled"), "Quote Cancelled");
});

test("the nine lifecycle statuses are all mapped by name", () => {
  assert.equal(KNOWN_QUOTE_STATUSES.length, 9);
});

test("a blank / missing status reads as Quote Pending", () => {
  assert.equal(quoteStatusLabel(null), "Quote Pending");
  assert.equal(quoteStatusLabel(undefined), "Quote Pending");
  assert.equal(quoteStatusLabel(""), "Quote Pending");
  assert.equal(quoteStatusLabel("   "), "Quote Pending");
});

test("an unrecognised status is title-cased, never shipped raw", () => {
  assert.equal(quoteStatusLabel("some_future_status"), "Some Future Status");
  assert.equal(quoteStatusLabel("needs-review"), "Needs Review");
});

test("no output ever contains a raw underscore", () => {
  for (const status of [...KNOWN_QUOTE_STATUSES, "", "brand_new_status"]) {
    assert.ok(
      !quoteStatusLabel(status).includes("_"),
      `${status} leaked a snake_case value`
    );
  }
});

test("casing and stray whitespace do not defeat the mapping", () => {
  assert.equal(quoteStatusLabel("  Quote_Accepted  "), "Quote Accepted");
});
