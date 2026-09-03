import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDocumentUrl } from "./invoice-document-url";

test("the document is keyed on the order's uuid, on the portal", () => {
  assert.equal(
    invoiceDocumentUrl("3f8b1c2e-0000-4aaa-8bbb-1234567890ab"),
    "https://keenan-group.com.au/invoice/document?o=3f8b1c2e-0000-4aaa-8bbb-1234567890ab"
  );
});

test("no uuid means no link at all, never a link to a 404", () => {
  assert.equal(invoiceDocumentUrl(null), null);
  assert.equal(invoiceDocumentUrl(undefined), null);
  assert.equal(invoiceDocumentUrl("  "), null);
});

test("PORTAL_BASE_URL wins, and a trailing slash never doubles up", () => {
  const prev = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = "http://localhost:3000/";
  try {
    assert.equal(
      invoiceDocumentUrl("abc"),
      "http://localhost:3000/invoice/document?o=abc"
    );
  } finally {
    if (prev === undefined) delete process.env.PORTAL_BASE_URL;
    else process.env.PORTAL_BASE_URL = prev;
  }
});
