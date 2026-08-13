import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FACET_VALUES,
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  PER_PAGE,
  andFilters,
  buildFilterClauses,
  clampOffset,
  clampPage,
  isCappedByLimit,
  nextChunkSize,
  remainingResults,
  sanitizeFacetValues,
  sanitizePriceKeys,
  sanitizeQuery,
  sanitizeSortKey,
} from "./search-results.ts";

// ── The bounds the load-more action depends on ────────────────────────────────
// Its arguments come from the browser, so every one of these is a security
// bound, not a convenience.

test("offset is clamped into [0, MAX_RESULTS] and never NaN", () => {
  assert.equal(clampOffset(0), 0);
  assert.equal(clampOffset(80), 80);
  assert.equal(clampOffset(-40), 0);
  assert.equal(clampOffset(999999), MAX_RESULTS);
  assert.equal(clampOffset("abc"), 0);
  assert.equal(clampOffset(undefined), 0);
  assert.equal(clampOffset(40.7), 40);
});

test("page (the no-JavaScript fallback) is clamped to the same cap", () => {
  assert.equal(clampPage("1"), 1);
  assert.equal(clampPage("3"), 3);
  assert.equal(clampPage("0"), 1);
  assert.equal(clampPage("-2"), 1);
  assert.equal(clampPage("99"), MAX_RESULTS / PER_PAGE);
  assert.equal(clampPage("abc"), 1);
  assert.equal(clampPage(undefined), 1);
});

test("the query is trimmed, length-bounded and never a non-string", () => {
  assert.equal(sanitizeQuery("  oven  "), "oven");
  assert.equal(sanitizeQuery("x".repeat(500)).length, MAX_QUERY_LENGTH);
  assert.equal(sanitizeQuery(42), "");
  assert.equal(sanitizeQuery(null), "");
});

test("facet values are decoded, bounded in count and length", () => {
  assert.deepEqual(sanitizeFacetValues("Waldorf,Roband"), ["Waldorf", "Roband"]);
  // Names can contain commas, so they arrive percent-encoded.
  assert.deepEqual(sanitizeFacetValues("Bain%20Marie%2C%20Hot"), ["Bain Marie, Hot"]);
  assert.equal(sanitizeFacetValues(Array.from({ length: 50 }, () => "a").join(",")).length, MAX_FACET_VALUES);
  assert.equal(sanitizeFacetValues(`${"z".repeat(400)}`)[0].length, 120);
  assert.deepEqual(sanitizeFacetValues(undefined), []);
});

test("price keys are allowlisted", () => {
  assert.deepEqual(sanitizePriceKeys("lt1000,gt3000"), ["lt1000", "gt3000"]);
  assert.deepEqual(sanitizePriceKeys("lt1000,price > 0 OR true"), ["lt1000"]);
  assert.deepEqual(sanitizePriceKeys("free"), []);
});

test("sort key is allowlisted, defaulting to relevance", () => {
  assert.equal(sanitizeSortKey("price_asc"), "price_asc");
  assert.equal(sanitizeSortKey("newest"), "newest");
  assert.equal(sanitizeSortKey("cost_asc"), "relevance");
  assert.equal(sanitizeSortKey(undefined), "relevance");
});

// ── Filter building ───────────────────────────────────────────────────────────

test("facet values are quoted, not concatenated, into the Meili filter", () => {
  const { brandClause, categoryClause, priceClause } = buildFilterClauses({
    brandValues: ['Wal"dorf', "Rob\\and"],
    categoryValues: ["Ovens"],
    priceKeys: ["lt1000"],
  });
  assert.equal(brandClause, 'brandName IN ["Wal\\"dorf", "Rob\\\\and"]');
  assert.equal(categoryClause, 'categoryNames IN ["Ovens"]');
  assert.equal(priceClause, "(price < 1000)");
});

test("no facets selected means no filter at all", () => {
  const clauses = buildFilterClauses({ brandValues: [], categoryValues: [], priceKeys: [] });
  assert.equal(andFilters(clauses.brandClause, clauses.categoryClause, clauses.priceClause), undefined);
});

test("selected facets AND together", () => {
  const clauses = buildFilterClauses({
    brandValues: ["Waldorf"],
    categoryValues: [],
    priceKeys: ["gt3000"],
  });
  assert.deepEqual(andFilters(clauses.brandClause, clauses.categoryClause, clauses.priceClause), [
    'brandName IN ["Waldorf"]',
    "(price > 3000)",
  ]);
});

// ── Feed progress ─────────────────────────────────────────────────────────────

test("the feed stops at the total when the result set is small", () => {
  assert.equal(remainingResults(40, 55), 15);
  assert.equal(nextChunkSize(40, 55), 15);
  assert.equal(remainingResults(55, 55), 0);
  assert.equal(nextChunkSize(55, 55), 0);
});

test("the feed stops at the cap when the result set is large", () => {
  assert.equal(remainingResults(0, 5000), MAX_RESULTS);
  assert.equal(nextChunkSize(0, 5000), PER_PAGE);
  assert.equal(remainingResults(MAX_RESULTS - 10, 5000), 10);
  assert.equal(nextChunkSize(MAX_RESULTS - 10, 5000), 10);
  assert.equal(remainingResults(MAX_RESULTS, 5000), 0);
  assert.equal(nextChunkSize(MAX_RESULTS, 5000), 0);
});

test("only a result set past the cap is reported as capped", () => {
  assert.equal(isCappedByLimit(MAX_RESULTS), false);
  assert.equal(isCappedByLimit(MAX_RESULTS + 1), true);
  assert.equal(isCappedByLimit(0), false);
});
