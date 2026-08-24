import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayManageAddressBook,
  mayFileAddressInBook,
  mayTypeNewAddressAtCheckout,
  ADDRESS_BOOK_CODES,
  addressAuthorityMessage,
  addressBookNoticeLines,
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

// ── What the refused customer is TOLD ────────────────────────────────────────

test("nothing is printed while the customer may do everything", () => {
  assert.equal(
    addressBookNoticeLines({ canAdd: true, canEdit: true, canRemove: true, hasSavedAddresses: true }),
    null
  );
});

test("a fully refused customer with NO saved address is not offered a choice among nothing", () => {
  const lines = addressBookNoticeLines({
    canAdd: false,
    canEdit: false,
    canRemove: false,
    hasSavedAddresses: false,
  });
  assert.ok(lines);
  const text = lines.join(" ");
  assert.match(text, /adding, changing or removing saved addresses/);
  assert.match(text, /still type a delivery address/);
  assert.doesNotMatch(text, /choose any/);
});

test("a fully refused customer WITH saved addresses is told they may still choose one", () => {
  const lines = addressBookNoticeLines({
    canAdd: false,
    canEdit: false,
    canRemove: false,
    hasSavedAddresses: true,
  });
  assert.ok(lines);
  assert.match(lines.join(" "), /choose any of the addresses below/);
});

// ── The promise must survive the NEXT screen (second review of card H5JdsMrC) ──
//
// `placeOrder` refuses the ORDER of a contact denied the two
// `add_*_address_in_checkout` codes unless the typed address is already saved on
// the account (10-role-enforcement rows 9/10). On production ALL 310 memberships
// this card refuses sit on accounts with zero saved addresses and 309 of them are
// denied those codes — so "you can still type a delivery address as you order"
// was false for essentially every customer who could ever read it.

test("a refused customer who ALSO cannot type an address at checkout is never told they can", () => {
  const lines = addressBookNoticeLines({
    canAdd: false,
    canEdit: false,
    canRemove: false,
    hasSavedAddresses: false,
    canTypeAddressAtCheckout: false,
  });
  assert.ok(lines);
  const text = lines.join(" ");
  assert.doesNotMatch(text, /still type/i, "the checkout would refuse that order");
  assert.doesNotMatch(text, /choose/i, "there is nothing on screen to choose");
  assert.match(text, /no delivery address saved to your profile/i);
  assert.match(text, /add it for you/i, "a refusal owes them a route that works");
});

test("typing at checkout is offered ONLY when the checkout would accept it", () => {
  for (const canTypeAddressAtCheckout of [true, false]) {
    const text = (
      addressBookNoticeLines({
        canAdd: false,
        canEdit: false,
        canRemove: false,
        hasSavedAddresses: false,
        canTypeAddressAtCheckout,
      }) ?? []
    ).join(" ");
    assert.equal(/still type/i.test(text), canTypeAddressAtCheckout);
  }
});

test("'choose one below' is printed only when there IS one below", () => {
  // The checkout picker is contact-scoped, so this book IS the list they will be
  // offered. A colleague's address on the same account is never shown to them and
  // must never be described as a choice.
  for (const hasSavedAddresses of [true, false]) {
    const text = (
      addressBookNoticeLines({
        canAdd: false,
        canEdit: false,
        canRemove: false,
        hasSavedAddresses,
        canTypeAddressAtCheckout: false,
      }) ?? []
    ).join(" ");
    assert.equal(/choose/i.test(text), hasSavedAddresses);
  }
});

test("mayTypeNewAddressAtCheckout reads the two checkout codes placeOrder reads", () => {
  const both = perms({
    isB2B: true,
    allow: ["add_billing_address_in_checkout", "add_shipping_address_in_checkout"],
  });
  assert.equal(mayTypeNewAddressAtCheckout(both), true);
  assert.equal(
    mayTypeNewAddressAtCheckout(perms({ isB2B: true, allow: ["add_billing_address_in_checkout"] })),
    false
  );
  assert.equal(mayTypeNewAddressAtCheckout(perms({ isB2B: false, allow: [] })), true);
  assert.equal(
    mayTypeNewAddressAtCheckout(perms({ isB2B: true, accountId: null, allow: [] })),
    true
  );
});

test("filing an address needs the checkout's permission AND the book's", () => {
  // The composition the whole card rests on, pinned so neither half can be
  // dropped: mayFileAddressInBook = mayTypeNewAddressAtCheckout && add-to-book.
  const checkoutOnly = perms({
    isB2B: true,
    allow: ["add_billing_address_in_checkout", "add_shipping_address_in_checkout"],
  });
  const bookOnly = perms({ isB2B: true, allow: [...ADDRESS_BOOK_CODES.add] });
  assert.equal(mayFileAddressInBook(checkoutOnly), false);
  assert.equal(mayFileAddressInBook(bookOnly), false);
});

test("the note never sends the customer to the account manager and never claims the book is shared", () => {
  for (const hasSavedAddresses of [true, false]) {
    const lines = addressBookNoticeLines({
      canAdd: false,
      canEdit: false,
      canRemove: false,
      hasSavedAddresses,
    });
    const text = (lines ?? []).join(" ");
    // The manager cannot change a colleague's saved address on ANY storefront
    // screen, and on production every refused contact IS their account's main
    // contact or has no such colleague — "ask them" is a dead end either way.
    assert.doesNotMatch(text, /manager|administrator|ask them/i);
    // The book is contact-scoped: these are the person's own rows.
    assert.doesNotMatch(text, /your account's saved addresses/i);
  }
});

test("a PARTIAL refusal still prints, and names only what is refused", () => {
  const lines = addressBookNoticeLines({
    canAdd: true,
    canEdit: false,
    canRemove: false,
    hasSavedAddresses: true,
  });
  assert.ok(lines, "a role that may add but not edit still owes an explanation");
  const text = lines.join(" ");
  assert.match(text, /changing or removing saved addresses/);
  assert.doesNotMatch(text, /adding/);
});

test("a single refused action reads as one verb, not a list", () => {
  const lines = addressBookNoticeLines({
    canAdd: true,
    canEdit: true,
    canRemove: false,
    hasSavedAddresses: true,
  });
  assert.ok(lines);
  assert.match(lines[0], /doesn't allow removing saved addresses\./);
});
