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
  remainingResults,
  facetOptions,
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
// `remainingResults` and `isCappedByLimit` are what SearchResultsFeed itself
// calls to decide whether to keep loading and whether to say it stopped early,
// so these cover the live bound.

test("the feed stops at the total when the result set is small", () => {
  assert.equal(remainingResults(40, 55), 15);
  assert.equal(remainingResults(55, 55), 0);
  // A source that over-reports (Meili's estimate) can push the offset past the
  // total; the feed must read that as "nothing left", never as a negative.
  assert.equal(remainingResults(80, 55), 0);
});

test("the feed stops at the cap when the result set is large", () => {
  assert.equal(remainingResults(0, 5000), MAX_RESULTS);
  assert.equal(remainingResults(MAX_RESULTS - 10, 5000), 10);
  assert.equal(remainingResults(MAX_RESULTS, 5000), 0);
  // One full page's worth is what the next request will ask for.
  assert.equal(Math.min(PER_PAGE, remainingResults(0, 5000)), PER_PAGE);
});

test("only a result set past the cap is reported as capped", () => {
  assert.equal(isCappedByLimit(MAX_RESULTS), false);
  assert.equal(isCappedByLimit(MAX_RESULTS + 1), true);
  assert.equal(isCappedByLimit(0), false);
});

// ── The rail's option list ────────────────────────────────────────────────────
// A ticked value with no row cannot be unticked, and its chip prints the raw
// percent-encoded parameter at the customer. (1RLP5nSJ.)

test("facetOptions keeps the busiest values, in order", () => {
  const opts = facetOptions({ Rational: 166, UNOX: 341, Giorik: 53 }, [], 2);
  assert.deepEqual(
    opts.map((o) => [o.label, o.count]),
    [
      ["UNOX", 341],
      ["Rational", 166],
    ]
  );
});

test("a ticked value that fell off the list keeps its row, with its real count", () => {
  const opts = facetOptions({ UNOX: 341, Rational: 166, "Alto-Shaam": 6 }, ["Alto-Shaam"], 2);
  assert.deepEqual(
    opts.map((o) => [o.label, o.count]),
    [
      ["UNOX", 341],
      ["Rational", 166],
      ["Alto-Shaam", 6],
    ]
  );
});

test("a ticked value the distribution does not hold at all still gets a row", () => {
  const opts = facetOptions({ UNOX: 341 }, ["Chef Inox"], 15);
  assert.deepEqual(opts.at(-1), { value: "Chef%20Inox", label: "Chef Inox", count: 0 });
});

test("a ticked value that is a PROTOTYPE key counts as absent, not as Object.prototype", () => {
  // Reachable by anyone, no sign-in: /search?brand=Waldorf,__proto__.
  // sanitizeFacetValues keeps the name, Waldorf still matches so the results
  // branch renders, and the ticked row is kept by the rule above — so a count
  // looked up on the raw distribution OBJECT would come back as
  // Object.prototype (or a function, for "toString"), and React throws
  // "Objects are not valid as a React child" when FacetCheckbox prints it. The
  // shopper would get the site error page instead of results.
  for (const key of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
    const opts = facetOptions({ Waldorf: 12, UNOX: 341 }, [key], 15);
    const row = opts[opts.length - 1];
    assert.equal(row.label, key, key);
    assert.equal(typeof row.count, "number", key);
    assert.equal(row.count, 0, key);
  }
  // And a real value alongside one is unaffected.
  const mixed = facetOptions({ Waldorf: 12 }, ["Waldorf", "__proto__"], 15);
  assert.deepEqual(
    mixed.map((o) => [o.label, o.count]),
    [
      ["Waldorf", 12],
      ["__proto__", 0],
    ]
  );
});

test("a ticked value already on the list is not duplicated", () => {
  const opts = facetOptions({ UNOX: 341, Rational: 166 }, ["UNOX"], 15);
  assert.equal(opts.length, 2);
});

test("option values are encoded the way the rail and the URL expect", () => {
  const opts = facetOptions({ "Smith, Jones": 3 }, [], 15);
  assert.equal(opts[0].value, encodeURIComponent("Smith, Jones"));
  assert.deepEqual(sanitizeFacetValues(new URLSearchParams({ brand: opts[0].value }).get("brand")), [
    "Smith, Jones",
  ]);
});
