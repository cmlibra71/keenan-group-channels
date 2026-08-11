import { test } from "node:test";
import assert from "node:assert/strict";
import { signInRedirect, safeNextPath, signInPrompt } from "./account-redirect.ts";

test("the guard's bounce carries the destination, encoded", () => {
  assert.equal(signInRedirect("/account/orders"), "/account?next=%2Faccount%2Forders");
  assert.equal(signInRedirect("/account/orders/142870"), "/account?next=%2Faccount%2Forders%2F142870");
});

test("same-site paths are honoured", () => {
  assert.equal(safeNextPath("/account/orders"), "/account/orders");
  assert.equal(safeNextPath("/account/orders/1?tab=items"), "/account/orders/1?tab=items");
});

test("nothing that could leave the site is honoured", () => {
  // Both forms are read as protocol-relative URLs by browsers.
  assert.equal(safeNextPath("//evil.example"), null);
  assert.equal(safeNextPath("/\\evil.example"), null);
  assert.equal(safeNextPath("https://evil.example"), null);
  assert.equal(safeNextPath("javascript:alert(1)"), null);
  assert.equal(safeNextPath("account/orders"), null);
});

test("a missing or non-string next is simply absent", () => {
  assert.equal(safeNextPath(undefined), null);
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(""), null);
  assert.equal(safeNextPath(42), null);
});

test("the prompt names what the customer came for", () => {
  assert.equal(signInPrompt("/account/orders"), "Sign in to see your order history.");
  assert.equal(signInPrompt("/account/orders/142870"), "Sign in to see your order history.");
  assert.equal(signInPrompt("/account/quotes"), "Sign in to see your quotes.");
  assert.equal(signInPrompt("/account/profile"), "Sign in to continue.");
});
