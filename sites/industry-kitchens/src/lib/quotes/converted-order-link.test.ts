import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertedOrderLink,
  isCancelledOrderStatus,
  VIEW_AND_PAY_ORDER_LABEL,
  VIEW_ORDER_LABEL,
} from "./converted-order-link";

// The cases are the live Chefs Depot records the independent review of card
// isl1uwjR found on 2026-09-11: a pay call-to-action beside cancelled orders
// (both spellings), beside fully paid ones, and to another contact's order.

const live = {
  orderId: 155000,
  orderFound: true,
  orderStatus: "pending_payment",
  viewable: true,
  payAllowed: true,
  carriesDeposit: false,
};

test("a live order this viewer can pay says View and pay your order", () => {
  assert.deepEqual(convertedOrderLink(live), {
    href: "/account/orders/155000",
    label: VIEW_AND_PAY_ORDER_LABEL,
  });
});

test("a cancelled order draws nothing, whichever way it is spelt", () => {
  for (const orderStatus of ["canceled", "cancelled", "Canceled", " CANCELLED "]) {
    assert.equal(convertedOrderLink({ ...live, orderStatus }), null, orderStatus);
    // Even if a stale balance would otherwise have been payable.
    assert.equal(convertedOrderLink({ ...live, orderStatus, payAllowed: true }), null);
  }
  assert.equal(isCancelledOrderStatus("declined"), false);
});

test("a fully paid order says only View your order", () => {
  // `payAllowed` is false because decidePayBalance refuses `nothing_owing`.
  assert.deepEqual(convertedOrderLink({ ...live, orderStatus: "complete", payAllowed: false }), {
    href: "/account/orders/155000",
    label: VIEW_ORDER_LABEL,
  });
});

test("an order this viewer may not open draws nothing (the order page would 404 it)", () => {
  assert.equal(convertedOrderLink({ ...live, viewable: false }), null);
  assert.equal(convertedOrderLink({ ...live, orderFound: false }), null);
});

test("Industry Kitchens — no card control on its order page — says View your order", () => {
  // IK's pay-balance-site answers NOT_OFFERED, so payAllowed is always false there.
  assert.equal(convertedOrderLink({ ...live, payAllowed: false })?.label, VIEW_ORDER_LABEL);
});

test("never says pay beside a deposit, because the order takes the whole balance", () => {
  assert.equal(convertedOrderLink({ ...live, carriesDeposit: true })?.label, VIEW_ORDER_LABEL);
});

test("a malformed id draws nothing", () => {
  for (const orderId of [0, -1, Number.NaN, 1.5]) {
    assert.equal(convertedOrderLink({ ...live, orderId }), null);
  }
});
