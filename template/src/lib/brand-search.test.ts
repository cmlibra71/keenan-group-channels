import { test } from "node:test";
import assert from "node:assert/strict";
import { brandFacetValue } from "./brand-search.ts";
import { sanitizeFacetValues } from "./search-results.ts";

// The one thing that can silently break: the brand a shopper searched from is
// not the brand /search filters on. These walk the WHOLE round trip — build the
// parameter, let a URL encode it a second time exactly as a GET form or
// URLSearchParams does, then read it back through the sanitiser /search itself
// uses.

const BRAND_NAMES = [
  "Rational",
  "Chef Inox",
  "Smith, Jones", // a comma: the reason the value is encoded before the URL is
  "Waldorf 100%", // a percent sign: decodeURIComponent throws on a bare one
  "Café Élite",
  'He said "hi"',
  "A&B / C",
  "Ürsprung + Söhne",
];

test("a brand name survives the round trip /search puts it through", () => {
  for (const name of BRAND_NAMES) {
    const sent = new URLSearchParams({ brand: brandFacetValue(name) }).toString();
    const arrived = new URLSearchParams(sent).get("brand");
    assert.deepEqual(sanitizeFacetValues(arrived), [name], name);
  }
});

test("the facet value is what the rail would have written for the same brand", () => {
  // The rail option value (`facetOptions`, lib/search-results.ts) is
  // encodeURIComponent(name); a mismatch means the results page filters on the
  // brand but cannot draw it as ticked, so the shopper cannot untick it.
  for (const name of BRAND_NAMES) {
    assert.equal(brandFacetValue(name), encodeURIComponent(name), name);
  }
});
