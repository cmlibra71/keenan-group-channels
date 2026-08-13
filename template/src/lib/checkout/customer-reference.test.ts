import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseCustomerReference,
  CUSTOMER_REFERENCE_MAX_LENGTH,
} from "./customer-reference.ts";

test("keeps a typed reference verbatim", () => {
  assert.equal(normaliseCustomerReference("PO-2322469"), "PO-2322469");
  assert.equal(normaliseCustomerReference("Job 41 / Kitchen fitout"), "Job 41 / Kitchen fitout");
});

test("trims and collapses whitespace", () => {
  assert.equal(normaliseCustomerReference("  PO-1234  "), "PO-1234");
  assert.equal(normaliseCustomerReference("PO   1234"), "PO 1234");
});

test("a pasted multi-line value becomes one line", () => {
  assert.equal(normaliseCustomerReference("PO-1\nPO-2"), "PO-1 PO-2");
  assert.equal(normaliseCustomerReference("PO-1\r\nPO-2\tX"), "PO-1 PO-2 X");
});

test("empty, blank and non-string values are null, never an empty string", () => {
  assert.equal(normaliseCustomerReference(""), null);
  assert.equal(normaliseCustomerReference("   "), null);
  assert.equal(normaliseCustomerReference("\n\t"), null);
  assert.equal(normaliseCustomerReference(null), null);
  assert.equal(normaliseCustomerReference(undefined), null);
  assert.equal(normaliseCustomerReference(42), null);
});

test("caps at the column width so Postgres never refuses the order", () => {
  const long = "A".repeat(CUSTOMER_REFERENCE_MAX_LENGTH + 25);
  const out = normaliseCustomerReference(long);
  assert.equal(out?.length, CUSTOMER_REFERENCE_MAX_LENGTH);
});

test("a cap that lands on a space does not leave a trailing space", () => {
  const long = `${"A".repeat(CUSTOMER_REFERENCE_MAX_LENGTH - 1)} BBBB`;
  const out = normaliseCustomerReference(long);
  assert.equal(out, "A".repeat(CUSTOMER_REFERENCE_MAX_LENGTH - 1));
});
