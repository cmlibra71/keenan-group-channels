import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayManageAddressBook,
  mayFileAddressInBook,
  ADDRESS_BOOK_CODES,
  addressAuthorityMessage,
} from "./address-authority.ts";

/** A permission context built from a set of codes this contact holds. */
function perms(opts: { isB2B: boolean; accountId?: number | null; allow?: string[] }) {
  const allowed = new Set(opts.allow ?? []);
  return {
    isB2B: opts.isB2B,
    accountId: opts.accountId === undefined ? 1 : opts.accountId,
    can: (code: string) => allowed.has(code),
  };
}

const EVERYTHING = [
  ...ADDRESS_BOOK_CODES.add,
  ...ADDRESS_BOOK_CODES.edit,
  ...ADDRESS_BOOK_CODES.remove,
  "add_billing_address_in_checkout",
  "add_shipping_address_in_checkout",
];

test("every write into the book takes the bill-to code AND the ship-to code", () => {
  assert.deepEqual(ADDRESS_BOOK_CODES.add, ["add_bill_to_address", "add_ship_to_address"]);
  assert.deepEqual(ADDRESS_BOOK_CODES.edit, ["edit_bill_to_address", "edit_ship_to_address"]);
  assert.deepEqual(ADDRESS_BOOK_CODES.remove, ["remove_bill_to_address", "remove_ship_to_address"]);
});

test("an accountless (B2C) shopper is their own manager and bypasses everything", () => {
  const p = perms({ isB2B: false, allow: [] });
  assert.equal(mayManageAddressBook(p, "add"), true);
  assert.equal(mayManageAddressBook(p, "edit"), true);
  assert.equal(mayManageAddressBook(p, "remove"), true);
  assert.equal(mayFileAddressInBook(p), true);
});

test("the manager may add, edit and remove", () => {
  const p = perms({ isB2B: true, allow: EVERYTHING });
  assert.equal(mayManageAddressBook(p, "add"), true);
  assert.equal(mayManageAddressBook(p, "edit"), true);
  assert.equal(mayManageAddressBook(p, "remove"), true);
  assert.equal(mayFileAddressInBook(p), true);
});

test("holding only the BILL-TO half is not enough — one book serves both", () => {
  const p = perms({
    isB2B: true,
    allow: [
      "add_bill_to_address",
      "edit_bill_to_address",
      "remove_bill_to_address",
      "add_billing_address_in_checkout",
      "add_shipping_address_in_checkout",
    ],
  });
  assert.equal(mayManageAddressBook(p, "add"), false);
  assert.equal(mayManageAddressBook(p, "edit"), false);
  assert.equal(mayManageAddressBook(p, "remove"), false);
  assert.equal(mayFileAddressInBook(p), false);
});

test("holding only the SHIP-TO half is not enough either", () => {
  const p = perms({
    isB2B: true,
    allow: ["add_ship_to_address", "edit_ship_to_address", "remove_ship_to_address"],
  });
  assert.equal(mayManageAddressBook(p, "add"), false);
  assert.equal(mayManageAddressBook(p, "edit"), false);
});

test("filing from checkout still needs Zoey's two checkout codes as well", () => {
  const p = perms({ isB2B: true, allow: [...ADDRESS_BOOK_CODES.add] });
  assert.equal(mayManageAddressBook(p, "add"), true);
  assert.equal(mayFileAddressInBook(p), false);
});

test("a B2B contact with no resolved account is not refused (fail open)", () => {
  const p = perms({ isB2B: true, accountId: null, allow: [] });
  assert.equal(mayFileAddressInBook(p), true);
});

test("the refusal names the action and points at somebody who can do it", () => {
  const msg = addressAuthorityMessage("editing");
  assert.match(msg, /editing addresses/);
  assert.match(msg, /account administrator/);
});
