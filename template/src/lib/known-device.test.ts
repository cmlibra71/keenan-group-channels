import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_DEVICE_COOKIE,
  KNOWN_DEVICE_MAX_AGE,
  parseRememberedEmail,
  chooseSignInEmail,
} from "./known-device.ts";

test("the cookie is named and lived once, in one place", () => {
  assert.equal(KNOWN_DEVICE_COOKIE, "known_device");
  assert.equal(KNOWN_DEVICE_MAX_AGE, 60 * 60 * 24 * 365);
});

test("a remembered address comes back normalised", () => {
  assert.equal(parseRememberedEmail("  Chef@Example.COM "), "chef@example.com");
});

test("anything that is not an address reads as an unknown device", () => {
  for (const junk of [
    null,
    undefined,
    "",
    "   ",
    "not-an-email",
    "no@domain",
    "<script>alert(1)</script>",
    "two addresses@a.com b@b.com",
  ]) {
    assert.equal(parseRememberedEmail(junk), null, `expected null for ${JSON.stringify(junk)}`);
  }
});

test("an absurdly long value is refused rather than rendered", () => {
  const long = `${"a".repeat(250)}@example.com`;
  assert.ok(long.length > 254);
  assert.equal(parseRememberedEmail(long), null);
});

test("a typed address always beats the remembered one", () => {
  assert.deepEqual(
    chooseSignInEmail({ typed: "typed@example.com", remembered: "device@example.com" }),
    { email: "typed@example.com", fromDevice: false }
  );
});

test("the remembered address only fills a blank field", () => {
  assert.deepEqual(chooseSignInEmail({ remembered: "device@example.com" }), {
    email: "device@example.com",
    fromDevice: true,
  });
  assert.deepEqual(chooseSignInEmail({ typed: "  ", remembered: "device@example.com" }), {
    email: "device@example.com",
    fromDevice: true,
  });
});

test("an unknown device starts with an empty field", () => {
  assert.deepEqual(chooseSignInEmail({}), { email: null, fromDevice: false });
  assert.deepEqual(chooseSignInEmail({ typed: "junk", remembered: "junk" }), {
    email: null,
    fromDevice: false,
  });
});
