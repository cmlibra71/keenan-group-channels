import { test } from "node:test";
import assert from "node:assert/strict";
import { GST_COOKIE, serializeGstCookie, parseGstInclusive } from "./gst-cookie.ts";

test("serialize writes the named cookie with the persistence attributes", () => {
  const c = serializeGstCookie(true);
  assert.match(c, new RegExp(`^${GST_COOKIE}=true;`));
  assert.match(c, /path=\//);
  assert.match(c, /max-age=31536000/);
  assert.match(c, /samesite=lax/);
});

test("serialize reflects the boolean", () => {
  assert.match(serializeGstCookie(false), new RegExp(`^${GST_COOKIE}=false;`));
});

test("parse: only the literal 'true' is inclusive", () => {
  assert.equal(parseGstInclusive("true"), true);
  assert.equal(parseGstInclusive("false"), false);
  assert.equal(parseGstInclusive(undefined), false);
  assert.equal(parseGstInclusive("1"), false);
});

test("serialize -> parse round-trips", () => {
  for (const v of [true, false]) {
    const value = serializeGstCookie(v).split(";")[0].split("=")[1];
    assert.equal(parseGstInclusive(value), v);
  }
});
