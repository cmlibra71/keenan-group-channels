import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveMinimums,
  filterPaymentMethodsForAccount,
  isPaymentMethodAllowed,
  minimumOrderError,
  type ChannelMinimums,
  isPaymentMethodOnChannel,
} from "./account-options-policy.ts";

const NO_GLOBALS: ChannelMinimums = {
  minOrderAmountEnabled: false,
  minOrderAmount: 0,
  minOrderQtyEnabled: false,
  minOrderQty: 0,
};

const METHODS = [{ id: "stripe" }, { id: "bank_transfer" }, { id: "net_terms" }];

// --- payment-method allow-list (visibility == authorization) -----------------

test("no allow-list ⇒ every channel method is shown and accepted", () => {
  assert.deepEqual(filterPaymentMethodsForAccount(METHODS, null), METHODS);
  for (const m of METHODS) assert.equal(isPaymentMethodAllowed(m.id, null), true);
});

test("an allow-list narrows the shown methods to exactly the accepted ones", () => {
  const allowed = ["bank_transfer"];
  const shown = filterPaymentMethodsForAccount(METHODS, allowed);
  assert.deepEqual(shown.map((m) => m.id), ["bank_transfer"]);
  // The invariant: shown ⟺ accepted.
  for (const m of METHODS) {
    const isShown = shown.some((s) => s.id === m.id);
    assert.equal(isPaymentMethodAllowed(m.id, allowed), isShown);
  }
});

test("a method outside the allow-list is rejected even if forced", () => {
  assert.equal(isPaymentMethodAllowed("stripe", ["bank_transfer", "net_terms"]), false);
});

// --- minimum-order collapse -------------------------------------------------

test("no account and no global minimums ⇒ no gate", () => {
  assert.deepEqual(effectiveMinimums(null, NO_GLOBALS), { minOrderAmount: null, minOrderQty: null });
});

test("guest / account-less shopper inherits the channel globals", () => {
  const globals: ChannelMinimums = {
    minOrderAmountEnabled: true,
    minOrderAmount: 250,
    minOrderQtyEnabled: true,
    minOrderQty: 3,
  };
  assert.deepEqual(effectiveMinimums(null, globals), { minOrderAmount: 250, minOrderQty: 3 });
});

test("a disabled global imposes no minimum", () => {
  const globals: ChannelMinimums = { ...NO_GLOBALS, minOrderAmount: 250, minOrderQty: 3 };
  assert.deepEqual(effectiveMinimums(null, globals), { minOrderAmount: null, minOrderQty: null });
});

test("the account's already-collapsed values win over the globals", () => {
  const globals: ChannelMinimums = {
    minOrderAmountEnabled: true,
    minOrderAmount: 250,
    minOrderQtyEnabled: true,
    minOrderQty: 3,
  };
  // resolveAccountOptionsForContact already collapsed the tri-state: 500 override, minimum off.
  assert.deepEqual(
    effectiveMinimums(
      { allowedPaymentMethods: null, minOrderAmount: 500, minOrderQty: null },
      globals
    ),
    { minOrderAmount: 500, minOrderQty: null }
  );
});

test("an account with the minimum switched off is NOT re-gated by the global", () => {
  const globals: ChannelMinimums = {
    minOrderAmountEnabled: true,
    minOrderAmount: 250,
    minOrderQtyEnabled: false,
    minOrderQty: 0,
  };
  assert.deepEqual(
    effectiveMinimums({ allowedPaymentMethods: null, minOrderAmount: null, minOrderQty: null }, globals),
    { minOrderAmount: null, minOrderQty: null }
  );
});

// --- the gate itself --------------------------------------------------------

test("an unrestricted cart passes", () => {
  assert.equal(
    minimumOrderError({ subtotalIncTax: 10, itemCount: 1 }, { minOrderAmount: null, minOrderQty: null }),
    null
  );
});

test("an under-minimum-amount cart is blocked with both figures in the message", () => {
  const err = minimumOrderError(
    { subtotalIncTax: 99.5, itemCount: 5 },
    { minOrderAmount: 250, minOrderQty: null }
  );
  assert.ok(err);
  assert.match(err, /\$250\.00/);
  assert.match(err, /\$99\.50/);
});

test("a cart exactly ON the minimum passes (>= not >)", () => {
  assert.equal(
    minimumOrderError({ subtotalIncTax: 250, itemCount: 3 }, { minOrderAmount: 250, minOrderQty: 3 }),
    null
  );
});

test("an under-minimum-quantity cart is blocked", () => {
  const err = minimumOrderError(
    { subtotalIncTax: 5000, itemCount: 2 },
    { minOrderAmount: null, minOrderQty: 3 }
  );
  assert.ok(err);
  assert.match(err, /minimum order quantity of 3 items/);
  assert.match(err, /has 2/);
});

// ── The channel half of "show equals accept" (card VAjaPj0t review) ─────────
// The account allow-list only NARROWS the channel list and is null for most
// shoppers, so on its own it accepted any string a form posted.

test("a method this channel does not offer customers is refused", () => {
  const cd = [{ id: "bank_transfer" }, { id: "stripe" }];
  assert.equal(isPaymentMethodOnChannel("bank_transfer", cd), true);
  assert.equal(isPaymentMethodOnChannel("stripe", cd), true);
  // The exact bypass the review found: a posted silverchef on a channel that
  // never enabled it would have written a real order at pending_payment.
  assert.equal(isPaymentMethodOnChannel("silverchef", cd), false);
  assert.equal(isPaymentMethodOnChannel("finance", cd), false);
  assert.equal(isPaymentMethodOnChannel("net_terms", cd), false);
});

test("a channel staff-only method cannot be forced through by a customer", () => {
  // customerPaymentMethods has already dropped staffOnly + disabled entries, so
  // the customer list simply does not contain them.
  const ikCustomerFacing = [{ id: "stripe" }, { id: "bank_transfer" }, { id: "net_terms" }];
  assert.equal(isPaymentMethodOnChannel("send_invoice", ikCustomerFacing), false);
});

test("an order taken with NO payment method is still allowed through", () => {
  // A specialised delivery held for a human freight quote (card Wxjp8wpg) has
  // an empty method and must not be gated here.
  assert.equal(isPaymentMethodOnChannel("", [{ id: "bank_transfer" }]), true);
});
