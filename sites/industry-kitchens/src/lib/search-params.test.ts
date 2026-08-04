import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampInt,
  parsePublicSearchParams,
  MAX_LIMIT,
  MAX_OFFSET,
  DEFAULT_LIMIT,
} from "./search-params.ts";

function parse(qs: string) {
  return parsePublicSearchParams(new URLSearchParams(qs));
}

test("clampInt falls back rather than propagating NaN", () => {
  // The previous route did Math.min(parseInt("abc"), 100) === NaN, and handed
  // that straight to Meilisearch.
  assert.equal(clampInt("abc", 1, 50, 20), 20);
  assert.equal(clampInt("", 1, 50, 20), 20);
  assert.equal(clampInt(null, 1, 50, 20), 20);
  assert.equal(clampInt(undefined, 1, 50, 20), 20);
});

test("clampInt bounds both ends", () => {
  assert.equal(clampInt("999", 1, 50, 20), 50);
  assert.equal(clampInt("-5", 0, 50, 20), 0);
  assert.equal(clampInt("30", 1, 50, 20), 30);
});

test("limit is clamped to the maximum", () => {
  assert.equal(parse("q=oven&limit=9999").limit, MAX_LIMIT);
  assert.equal(parse("q=oven").limit, DEFAULT_LIMIT);
  assert.equal(parse("q=oven&limit=8").limit, 8);
});

test("offset is bounded, closing deep-pagination enumeration", () => {
  assert.equal(parse("q=oven&offset=999999").offset, MAX_OFFSET);
  assert.equal(parse("q=oven&offset=-10").offset, 0);
  assert.equal(parse("q=oven&offset=40").offset, 40);
});

test("the arbitrary Meilisearch filter parameter no longer exists", () => {
  const parsed = parse(
    "q=oven&filter=" + encodeURIComponent('costPrice > 0 OR id EXISTS')
  );
  assert.equal("filter" in parsed, false);
});

test("sort is allowlisted", () => {
  assert.deepEqual(parse("q=oven&sort=price:asc").sort, ["price:asc"]);
  assert.equal(parse("q=oven&sort=costPrice:desc").sort, undefined);
  assert.deepEqual(parse("q=oven&sort=price:asc,costPrice:desc").sort, ["price:asc"]);
});

test("facets are allowlisted", () => {
  assert.deepEqual(parse("q=oven&facets=brandName").facets, ["brandName"]);
  assert.equal(parse("q=oven&facets=costPrice").facets, undefined);
});

test("single-character queries are refused", () => {
  assert.equal(parse("q=a").tooShort, true);
  assert.equal(parse("q=").tooShort, true);
  assert.equal(parse("").tooShort, true);
  assert.equal(parse("q=ov").tooShort, false);
});

test("the query is trimmed", () => {
  assert.equal(parse("q=%20%20oven%20%20").q, "oven");
});
