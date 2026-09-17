import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_SESSION_COOKIE,
  SEARCH_SESSION_MAX_AGE,
  isValidSearchSessionId,
  newSearchSessionId,
  searchSessionCookieValue,
  withCookie,
} from "./search-session";

test("a minted id is a uuid this module would accept back", () => {
  const id = newSearchSessionId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(isValidSearchSessionId(id), true);
});

test("two mints differ", () => {
  assert.notEqual(newSearchSessionId(), newSearchSessionId());
});

test("a session id echoed back from a browser is treated as untrusted text", () => {
  assert.equal(isValidSearchSessionId(undefined), false);
  assert.equal(isValidSearchSessionId(null), false);
  assert.equal(isValidSearchSessionId(""), false);
  assert.equal(isValidSearchSessionId("abc"), false); // too short to be ours
  assert.equal(isValidSearchSessionId("a".repeat(65)), false);
  assert.equal(isValidSearchSessionId("'; DROP TABLE search_log; --"), false);
  assert.equal(isValidSearchSessionId("<script>alert(1)</script>"), false);
});

test("the cookie is HttpOnly, Lax and path-wide, and Secure only where it can be", () => {
  const value = searchSessionCookieValue("0b4d2f6e-7c1a-4a2b-9d3e-5f6a7b8c9d0e", true);
  assert.match(value, new RegExp(`^${SEARCH_SESSION_COOKIE}=0b4d2f6e-`));
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /Path=\//);
  assert.match(value, new RegExp(`Max-Age=${SEARCH_SESSION_MAX_AGE}`));
  assert.match(value, /Secure/);
  // Local http development would drop a Secure cookie silently.
  assert.doesNotMatch(searchSessionCookieValue("x", false), /Secure/);
});

test("withCookie adds the id to a request that already carries cookies", () => {
  assert.equal(
    withCookie("cart_id=abc; gst_inclusive=true", SEARCH_SESSION_COOKIE, "sid-1"),
    "cart_id=abc; gst_inclusive=true; kg_sid=sid-1"
  );
});

test("withCookie is the whole header when there were none", () => {
  assert.equal(withCookie(null, SEARCH_SESSION_COOKIE, "sid-1"), "kg_sid=sid-1");
  assert.equal(withCookie("  ", SEARCH_SESSION_COOKIE, "sid-1"), "kg_sid=sid-1");
});
