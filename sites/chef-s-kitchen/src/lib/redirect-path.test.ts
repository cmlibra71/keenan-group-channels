import test from "node:test";
import assert from "node:assert/strict";
import {
  isRedirectCandidate,
  isReservedCatchAllPath,
  normalizeLookupPath,
  relativeRedirectTarget,
} from "./redirect-path";

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

test("a backslash is folded, because a browser reads it as a slash", () => {
  assert.equal(normalizeLookupPath("/\\evil.com"), "/evil.com");
  assert.equal(normalizeLookupPath("\\\\evil.com/x"), "/evil.com/x");
});

test("only a path on this site is ever handed to Location", () => {
  assert.equal(relativeRedirectTarget("/categories/fridges"), "/categories/fridges");
  assert.equal(relativeRedirectTarget("/"), "/");
  assert.equal(relativeRedirectTarget("/products/x?variant=2"), "/products/x?variant=2");
  // Anything that would land the shopper on another site is disarmed: the off-site
  // shapes come back as a local path (which 404s here) or as nothing at all.
  assert.equal(relativeRedirectTarget("/\\evil.com"), "/evil.com");
  assert.equal(relativeRedirectTarget("//evil.com"), "/evil.com");
  assert.equal(relativeRedirectTarget("\\\\evil.com"), "/evil.com");
  assert.equal(relativeRedirectTarget("https://evil.com/x"), null);
  assert.equal(relativeRedirectTarget("HTTPS://evil.com/x"), null);
  assert.equal(relativeRedirectTarget("javascript:alert(1)"), null);
  assert.equal(relativeRedirectTarget(""), null);
  assert.equal(relativeRedirectTarget(null), null);
});

test("the catch-all refuses namespaces the site owns, so a mistyped API path is a 404", () => {
  for (const path of ["/api/orders", "/API/orders", "/_next/static/x", "/checkout/step-2", "/sitemap.xml"]) {
    assert.equal(isReservedCatchAllPath(path), true, path);
  }
  for (const path of ["/roband-dm31w", "/greek/roband-dm31w", "/terms-and-conditions"]) {
    assert.equal(isReservedCatchAllPath(path), false, path);
  }
});
