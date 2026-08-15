import test from "node:test";
import assert from "node:assert/strict";
import { isRedirectCandidate, normalizeLookupPath } from "./redirect-path";

test("an address is reduced to the shape rows are stored in", () => {
  assert.equal(normalizeLookupPath("/About-Us"), "/about-us");
  assert.equal(normalizeLookupPath("/about-us/"), "/about-us");
  assert.equal(normalizeLookupPath("/about-us?utm_source=google"), "/about-us");
  assert.equal(normalizeLookupPath("/about-us#team"), "/about-us");
  assert.equal(normalizeLookupPath("//shop-online//catering"), "/shop-online/catering");
  assert.equal(normalizeLookupPath("shop-online"), "/shop-online");
});

test("the site root is left alone", () => {
  assert.equal(normalizeLookupPath("/"), "/");
  assert.equal(isRedirectCandidate("/"), false);
});

test("a legacy Zoey address is a candidate", () => {
  assert.equal(isRedirectCandidate("/Greek/roband-dm31w"), true);
  assert.equal(isRedirectCandidate("/shop-online/catering-equipment"), true);
});

test("asset requests never cost a lookup", () => {
  for (const path of ["/favicon.ico", "/logo.png", "/app.js", "/style.css", "/font.woff2"]) {
    assert.equal(isRedirectCandidate(path), false, path);
  }
});
