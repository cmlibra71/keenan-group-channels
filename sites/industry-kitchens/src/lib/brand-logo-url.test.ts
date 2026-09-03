import { test } from "node:test";
import assert from "node:assert/strict";
import { usableBrandLogo } from "./brand-logo-url";

// Card tSrCcnvx. The gate exists because `/api/image` 403s anything outside our
// own buckets, and a 403 renders as the browser's broken-image glyph — strictly
// worse than the grey box this card replaces. So a logo the proxy would refuse
// has to read here as NO logo.

const OURS = "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/brands/426/logo.png";

test("an allowlisted logo comes back as itself", () => {
  assert.equal(usableBrandLogo(OURS), OURS);
});

test("blank, empty and missing all read as no logo", () => {
  assert.equal(usableBrandLogo(null), null);
  assert.equal(usableBrandLogo(undefined), null);
  assert.equal(usableBrandLogo(""), null);
  assert.equal(usableBrandLogo("   "), null);
});

test("a logo our own image proxy would refuse reads as no logo", () => {
  assert.equal(usableBrandLogo("https://evil.example.com/brands/426/logo.png"), null);
  assert.equal(usableBrandLogo("http://keenan-group-images.s3.ap-southeast-2.amazonaws.com/x.png"), null);
  assert.equal(usableBrandLogo("/brands/426/logo.png"), null);
});

test("surrounding whitespace is trimmed rather than failing the check", () => {
  assert.equal(usableBrandLogo(`  ${OURS}  `), OURS);
});
