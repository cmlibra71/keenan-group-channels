import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_REQUIRED_SETTING,
  SIGN_IN_REQUIRED_MESSAGE,
  checkoutNeedsSignIn,
} from "./account-required.ts";

test("a guest on a channel that requires an account is stopped", () => {
  assert.equal(checkoutNeedsSignIn(true, false), true);
});

test("a signed-in shopper is never stopped", () => {
  assert.equal(checkoutNeedsSignIn(true, true), false);
});

test("a channel that allows guest checkout stops nobody", () => {
  // Chefs Depot: guest checkout is settled behaviour (card yUNl5TPq).
  assert.equal(checkoutNeedsSignIn(false, false), false);
  assert.equal(checkoutNeedsSignIn(false, true), false);
});

test("the setting key and the customer wording are fixed in one place", () => {
  assert.equal(ACCOUNT_REQUIRED_SETTING, "require_account_to_checkout");
  assert.equal(SIGN_IN_REQUIRED_MESSAGE, "You must sign in or create an account to check out.");
});
