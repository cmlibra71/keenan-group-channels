import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressKey,
  isDuplicateAddress,
  defaultsForNewAddress,
  type ExistingAddressRow,
} from "./save-address.ts";

const SAVED: ExistingAddressRow[] = [
  { address1: "12 Bourke Street", postal_code: "3000" },
  { address1: "88 Smith Rd", postal_code: "3140" },
];

// --- addressKey normalisation -----------------------------------------------

test("addressKey lowercases, collapses whitespace and trims", () => {
  assert.equal(addressKey("  12   BOURKE  Street ", " 3000 "), "12 bourke street|3000");
});

test("addressKey tolerates empty parts", () => {
  assert.equal(addressKey("", ""), "|");
});

// --- duplicate detection ----------------------------------------------------

test("an exact match is a duplicate", () => {
  assert.equal(isDuplicateAddress(addressKey("12 Bourke Street", "3000"), SAVED), true);
});

test("case and whitespace variance is still a duplicate", () => {
  assert.equal(isDuplicateAddress(addressKey("12  bourke   STREET", " 3000"), SAVED), true);
});

test("same street, different postcode is NOT a duplicate", () => {
  assert.equal(isDuplicateAddress(addressKey("12 Bourke Street", "3001"), SAVED), false);
});

test("a genuinely new address is NOT a duplicate", () => {
  assert.equal(isDuplicateAddress(addressKey("5 Collins St", "3000"), SAVED), false);
});

test("an empty address book has no duplicates", () => {
  assert.equal(isDuplicateAddress(addressKey("12 Bourke Street", "3000"), []), false);
});

test("null columns on a stored row never match a real address", () => {
  const rows: ExistingAddressRow[] = [{ address1: null, postal_code: null }];
  assert.equal(isDuplicateAddress(addressKey("12 Bourke Street", "3000"), rows), false);
});

// --- default flags ----------------------------------------------------------

test("the first saved address becomes default billing AND shipping", () => {
  assert.deepEqual(defaultsForNewAddress(0), {
    isDefaultBilling: true,
    isDefaultShipping: true,
  });
});

test("a second address never becomes the default", () => {
  assert.deepEqual(defaultsForNewAddress(1), {
    isDefaultBilling: false,
    isDefaultShipping: false,
  });
});

test("a third address never becomes the default either", () => {
  assert.deepEqual(defaultsForNewAddress(3), {
    isDefaultBilling: false,
    isDefaultShipping: false,
  });
});
