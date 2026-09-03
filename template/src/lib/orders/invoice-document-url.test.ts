import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDocumentUrl, offersInvoiceDocument } from "./invoice-document-url";

const UUID = "3f8b1c2e-0000-4aaa-8bbb-1234567890ab";
const CHEFS_DEPOT = { url: "https://chefsdepot.com.au", publicSubdomain: "quotes" };
const INDUSTRY_KITCHENS = { url: "https://industrialkitchens.com.au", publicSubdomain: "quotes" };

test("the document is served on THIS storefront's own quotes host, not the parent group's", () => {
  assert.equal(
    invoiceDocumentUrl(UUID, CHEFS_DEPOT),
    `https://quotes.chefsdepot.com.au/invoice/document?o=${UUID}`
  );
});

test("the two businesses never send a customer to each other's domain, nor to keenan-group.com.au", () => {
  const cd = invoiceDocumentUrl(UUID, CHEFS_DEPOT)!;
  const ik = invoiceDocumentUrl(UUID, INDUSTRY_KITCHENS)!;
  assert.ok(cd.startsWith("https://quotes.chefsdepot.com.au/"));
  assert.ok(ik.startsWith("https://quotes.industrialkitchens.com.au/"));
  assert.ok(!cd.includes("keenan-group"));
  assert.ok(!ik.includes("keenan-group"));
  assert.ok(!cd.includes("industrialkitchens"));
  assert.ok(!ik.includes("chefsdepot"));
});

test("a site with no public subdomain is served on its own apex, still never the group's", () => {
  assert.equal(
    invoiceDocumentUrl(UUID, { url: "https://chefsdepot.com.au/", publicSubdomain: null }),
    `https://chefsdepot.com.au/invoice/document?o=${UUID}`
  );
});

test("no uuid means no link at all, never a link to a 404", () => {
  assert.equal(invoiceDocumentUrl(null, CHEFS_DEPOT), null);
  assert.equal(invoiceDocumentUrl(undefined, CHEFS_DEPOT), null);
  assert.equal(invoiceDocumentUrl("  ", CHEFS_DEPOT), null);
});

test("PORTAL_BASE_URL is the fallback ONLY when there is no site row to build a host from", () => {
  const prev = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = "http://localhost:3000/";
  try {
    assert.equal(
      invoiceDocumentUrl(UUID, null),
      `http://localhost:3000/invoice/document?o=${UUID}`
    );
    // A real site row wins over it, so a local override can never redirect a live customer.
    assert.equal(
      invoiceDocumentUrl(UUID, CHEFS_DEPOT),
      `https://quotes.chefsdepot.com.au/invoice/document?o=${UUID}`
    );
  } finally {
    if (prev === undefined) delete process.env.PORTAL_BASE_URL;
    else process.env.PORTAL_BASE_URL = prev;
  }
});

test("an order with no live lines is offered nothing — the document build refuses on that first", () => {
  assert.equal(offersInvoiceDocument({ status: "processing", hasLiveLines: false }), false);
  assert.equal(offersInvoiceDocument({ status: "processing", hasLiveLines: true }), true);
});

test("a cancelled, declined or refunded order is never handed a payment demand", () => {
  for (const status of [
    "cancelled",
    "canceled",
    "Canceled",
    "declined",
    "refunded",
    "refund_in_progress",
    "closed",
  ]) {
    assert.equal(offersInvoiceDocument({ status, hasLiveLines: true }), false, status);
  }
});

test("a live order in any ordinary state still gets its invoice", () => {
  for (const status of ["pending", "processing", "complete", "shipped", null, undefined]) {
    assert.equal(offersInvoiceDocument({ status, hasLiveLines: true }), true, String(status));
  }
});
