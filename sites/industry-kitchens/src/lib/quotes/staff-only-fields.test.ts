import { test } from "node:test";
import assert from "node:assert/strict";
import { STAFF_ONLY_QUOTE_FIELDS, stripStaffOnlyFields } from "./staff-only-fields";

/**
 * `quoteService.getWithItems` is a `SELECT *` and the customer's own quote page calls
 * it, so every staff-only column on `quotes` has to be named here. This test is the
 * thing that fails when somebody adds one and forgets (card 9tbz3sBF's rule; card
 * T7Wclho8 is the column that forgot).
 */
test("the customer's quote never carries a staff-only column", () => {
  const quote = {
    id: 1,
    quote_number: "CD-QU:1000",
    quote_amount: "100.0000",
    internal_notes: "matched a competitor, do not tell them",
    acquisition_source: "web_form",
    acquisition_utm: { utm_source: "google", utm_campaign: "spring-ovens" },
  };
  const safe = stripStaffOnlyFields(quote) as Record<string, unknown>;
  for (const field of STAFF_ONLY_QUOTE_FIELDS) {
    assert.equal(field in safe, false, `${field} reached the customer's quote`);
  }
  // Everything the page actually renders survives.
  assert.equal(safe.quote_number, "CD-QU:1000");
  assert.equal(safe.quote_amount, "100.0000");
});

test("marketing attribution is staff-only, both halves of it", () => {
  // Which ad we credit a customer to, and the utm/referrer/landing trail behind it, are
  // internal figures read back on a staff screen and grouped in a staff report.
  assert.ok(STAFF_ONLY_QUOTE_FIELDS.includes("acquisition_source" as never));
  assert.ok(STAFF_ONLY_QUOTE_FIELDS.includes("acquisition_utm" as never));
});

test("stripping is a COPY — the service row a dozen staff screens share is untouched", () => {
  const row = { internal_notes: "staff only", acquisition_source: "phone" };
  stripStaffOnlyFields(row);
  assert.equal(row.internal_notes, "staff only");
  assert.equal(row.acquisition_source, "phone");
});
