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

  // A browser strips TAB/CR/LF from a URL before parsing it, so these reach the
  // parser as "//evil.example" and resolve off-site despite starting with "/".
  const tab = String.fromCharCode(9);
  const cr = String.fromCharCode(13);
  const lf = String.fromCharCode(10);
  assert.equal(new URL(`/${tab}/evil.example`, "https://example.com/account").host, "evil.example");
  assert.equal(safeNextPath(`/${tab}/evil.example`), null);
  assert.equal(safeNextPath(`/${cr}/evil.example`), null);
  assert.equal(safeNextPath(`/${lf}/evil.example`), null);
  assert.equal(safeNextPath(`/${cr}${lf}/evil.example`), null);
  // CR/LF anywhere would also poison the redirect header (Node: ERR_INVALID_CHAR).
  assert.equal(safeNextPath(`/account/orders${cr}${lf}Set-Cookie: a=b`), null);
  // The rest of the C0 range and DEL are rejected on the same principle.
  assert.equal(safeNextPath(`/account/${String.fromCharCode(0)}orders`), null);
  assert.equal(safeNextPath(`/account/${String.fromCharCode(127)}orders`), null);
});

test("a missing or non-string next is simply absent", () => {
  assert.equal(safeNextPath(undefined), null);
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(""), null);
  assert.equal(safeNextPath(42), null);
});

test("the prompt names what the customer came for", () => {
  // Guest checkouts get order confirmations too, so the order prompt has to say
  // how someone with no password reaches the same history.
  assert.match(signInPrompt("/account/orders"), /order history/);
  assert.match(signInPrompt("/account/orders"), /guest/);
  assert.match(signInPrompt("/account/orders/142870"), /order history/);
  assert.equal(signInPrompt("/account/quotes"), "Sign in to see your quotes.");
  assert.equal(signInPrompt("/account/profile"), "Sign in to continue.");
});
