import test from "node:test";
import assert from "node:assert/strict";
import {
  INVOICE_ARCHIVE_PATH,
  MAX_ARCHIVE_INVOICES,
  archivePanelWording,
  invoiceArchiveEndpoint,
  selectArchiveInvoices,
  type ArchiveCandidate,
} from "./invoice-archive";

const uuidFor = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

function order(overrides: Partial<ArchiveCandidate> & { uuid?: string | null } = {}): ArchiveCandidate {
  return {
    uuid: overrides.uuid === undefined ? uuidFor(1) : overrides.uuid,
    status: overrides.status ?? "processing",
    hasLiveLines: overrides.hasLiveLines ?? true,
  };
}

test("an order that may be invoiced goes in the archive", () => {
  const selection = selectArchiveInvoices([order()]);
  assert.deepEqual(selection.uuids, [uuidFor(1)]);
  assert.equal(selection.available, 1);
  assert.equal(selection.capped, false);
});

test("the archive holds exactly what the per-order Download would offer, and nothing else", () => {
  // Each of these is a refusal `offersInvoiceDocument` already owns (card EizZjaY3): a cancelled,
  // declined, refunded or closed order is never invoiced — its document closes with a payment
  // demand — and an order with no live lines is one the document build refuses outright.
  const selection = selectArchiveInvoices([
    order({ uuid: uuidFor(1) }),
    order({ uuid: uuidFor(2), status: "cancelled" }),
    order({ uuid: uuidFor(3), status: "refunded" }),
    order({ uuid: uuidFor(4), status: "declined" }),
    order({ uuid: uuidFor(5), status: "closed" }),
    order({ uuid: uuidFor(6), hasLiveLines: false }),
  ]);
  assert.deepEqual(selection.uuids, [uuidFor(1)]);
  assert.equal(selection.available, 1);
});

test("no uuid means no document, never a request for one", () => {
  const selection = selectArchiveInvoices([
    order({ uuid: null }),
    order({ uuid: "   " }),
    order({ uuid: uuidFor(2) }),
  ]);
  assert.deepEqual(selection.uuids, [uuidFor(2)]);
});

test("the order given is the order kept — newest first, as the caller sorted them", () => {
  const selection = selectArchiveInvoices([
    order({ uuid: uuidFor(3) }),
    order({ uuid: uuidFor(2) }),
    order({ uuid: uuidFor(1) }),
  ]);
  assert.deepEqual(selection.uuids, [uuidFor(3), uuidFor(2), uuidFor(1)]);
});

test("a history longer than the cap is capped and SAYS so, never silently truncated", () => {
  const many = Array.from({ length: MAX_ARCHIVE_INVOICES + 7 }, (_, i) =>
    order({ uuid: uuidFor(i + 1) })
  );
  const selection = selectArchiveInvoices(many);
  assert.equal(selection.uuids.length, MAX_ARCHIVE_INVOICES);
  assert.equal(selection.available, MAX_ARCHIVE_INVOICES + 7);
  assert.equal(selection.capped, true);

  const wording = archivePanelWording(selection);
  assert.ok(wording);
  assert.match(wording.body, /most recent/);
  assert.match(wording.body, new RegExp(`${MAX_ARCHIVE_INVOICES + 7} in total`));
  assert.match(wording.body, /open any older order/);
});

test("nothing to offer renders NOTHING — never a button that downloads an empty file", () => {
  assert.equal(archivePanelWording(selectArchiveInvoices([])), null);
  assert.equal(archivePanelWording(selectArchiveInvoices([order({ status: "cancelled" })])), null);
});

test("the wording counts in plain words and agrees with itself", () => {
  const one = archivePanelWording(selectArchiveInvoices([order({ uuid: uuidFor(1) })]));
  assert.ok(one);
  assert.equal(one.count, 1);
  assert.equal(one.body, "Download your tax invoice as one zip file.");
  assert.equal(one.button, "Download invoice (.zip)");

  const two = archivePanelWording(
    selectArchiveInvoices([order({ uuid: uuidFor(1) }), order({ uuid: uuidFor(2) })])
  );
  assert.ok(two);
  assert.equal(two.body, "Download all 2 of your tax invoices as one zip file.");
  assert.equal(two.button, "Download all 2 invoices (.zip)");
  assert.equal(two.heading, "Your tax invoices");
});

test("the download link is a path on THIS storefront, so it carries the session", () => {
  assert.equal(INVOICE_ARCHIVE_PATH, "/account/invoices/download");
  assert.ok(INVOICE_ARCHIVE_PATH.startsWith("/"));
});

test("the archive endpoint is on this storefront's OWN portal host, like the per-order link", () => {
  assert.equal(
    invoiceArchiveEndpoint({ url: "https://chefsdepot.com.au", publicSubdomain: "quotes" }),
    "https://quotes.chefsdepot.com.au/invoice/documents"
  );
  assert.equal(
    invoiceArchiveEndpoint({ url: "https://industrialkitchens.com.au", publicSubdomain: "quotes" }),
    "https://quotes.industrialkitchens.com.au/invoice/documents"
  );
});

test("a channel with no site row still reaches the portal rather than nowhere", () => {
  assert.match(invoiceArchiveEndpoint(null), /^https?:\/\/.+\/invoice\/documents$/);
  assert.match(invoiceArchiveEndpoint({ url: null }), /^https?:\/\/.+\/invoice\/documents$/);
});
