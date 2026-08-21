import { test } from "node:test";
import assert from "node:assert/strict";
import { canViewOrder, type OrderAccessInput } from "./order-access.ts";

const base: OrderAccessInput = {
  orderChannelId: 2,
  orderContactId: 100,
  channelId: 2,
  sessionContactId: 100,
  accountMemberIds: [],
  guestEmailMatch: false,
};

const at = (over: Partial<OrderAccessInput>): OrderAccessInput => ({ ...base, ...over });

test("own order on this channel is visible", () => {
  assert.equal(canViewOrder(base), true);
});

test("another contact's order is hidden without the account-wide permission", () => {
  // accountMemberIds is populated ONLY when view_company_orders is granted, so
  // an empty list is exactly the "permission not granted" case.
  assert.equal(canViewOrder(at({ orderContactId: 101, accountMemberIds: [] })), false);
});

test("an account colleague's order is visible when the role grants it", () => {
  assert.equal(
    canViewOrder(at({ orderContactId: 101, accountMemberIds: [100, 101, 102] })),
    true
  );
});

test("a contact outside the account stays hidden even with the permission", () => {
  assert.equal(
    canViewOrder(at({ orderContactId: 999, accountMemberIds: [100, 101, 102] })),
    false
  );
});

test("guest order matched on the billing inbox is visible", () => {
  assert.equal(canViewOrder(at({ orderContactId: null, guestEmailMatch: true })), true);
});

test("guest order that does not match the inbox is hidden", () => {
  assert.equal(canViewOrder(at({ orderContactId: null, guestEmailMatch: false })), false);
});

test("a contact-keyed order is never opened by the guest-email match", () => {
  // The email rule exists for orders with NO contact. A contact-keyed order that
  // happens to carry the same billing email must still go through the contact rules.
  assert.equal(
    canViewOrder(at({ orderContactId: 101, accountMemberIds: [], guestEmailMatch: true })),
    false
  );
});

test("wrong channel is hidden however strong the other signals are", () => {
  assert.equal(canViewOrder(at({ orderChannelId: 1 })), false);
  assert.equal(
    canViewOrder(at({ orderChannelId: 1, orderContactId: null, guestEmailMatch: true })),
    false
  );
  assert.equal(
    canViewOrder(at({ orderChannelId: 1, orderContactId: 101, accountMemberIds: [101] })),
    false
  );
});

test("an orphan order (no contact, no email match) is hidden", () => {
  assert.equal(
    canViewOrder(at({ orderContactId: null, accountMemberIds: [100, 101], guestEmailMatch: false })),
    false
  );
});
