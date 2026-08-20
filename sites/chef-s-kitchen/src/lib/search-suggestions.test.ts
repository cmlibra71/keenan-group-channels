import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SUGGESTIONS,
  SUGGESTIONS_PER_PAGE,
  hasMoreSuggestions,
  isSuggestionsCapped,
  nextSuggestionOffset,
  remainingSuggestions,
  suggestionPageSize,
  suggestionRequestUrl,
} from "./search-suggestions.ts";
import { MAX_RESULTS, PER_PAGE } from "./search-results.ts";
import { MAX_RESULT_WINDOW, MAX_LIMIT, parsePublicSearchParams } from "./search-params.ts";

test("the dropdown pages on the same numbers as the /search page", () => {
  // A shopper who scrolls the dropdown to its end and then clicks "view all"
  // must not find the two lists disagreeing about where the results stop.
  assert.equal(MAX_SUGGESTIONS, MAX_RESULTS);
  assert.equal(SUGGESTIONS_PER_PAGE, PER_PAGE);
});

test("the public endpoint reaches exactly as deep as the dropdown asks", () => {
  // The endpoint's window clamp and the dropdown's ceiling are the same bound
  // seen from two sides; drift makes the last page silently short.
  assert.equal(MAX_RESULT_WINDOW, MAX_SUGGESTIONS);
});

test("the last page is shortened to land exactly on the ceiling", () => {
  assert.equal(suggestionPageSize(0), SUGGESTIONS_PER_PAGE);
  assert.equal(suggestionPageSize(280), 40);
  assert.equal(suggestionPageSize(300), 20);
  assert.equal(suggestionPageSize(MAX_SUGGESTIONS), 0);
  assert.equal(suggestionPageSize(9999), 0);
  assert.equal(suggestionPageSize(-5), SUGGESTIONS_PER_PAGE);
});

test("remaining is bounded by the ceiling, not by the index's estimate", () => {
  assert.equal(remainingSuggestions(40, 1000), MAX_SUGGESTIONS - 40);
  assert.equal(remainingSuggestions(40, 55), 15);
  assert.equal(remainingSuggestions(MAX_SUGGESTIONS, 1000), 0);
  assert.equal(remainingSuggestions(400, 1000), 0);
  assert.equal(remainingSuggestions(-1, -1), 0);
});

test("capped is about the index holding more than the dropdown will show", () => {
  assert.equal(isSuggestionsCapped(1000), true);
  assert.equal(isSuggestionsCapped(MAX_SUGGESTIONS), false);
  assert.equal(isSuggestionsCapped(0), false);
});

test("the next offset is built from positions consumed, never rows rendered", () => {
  // Catalogue scope drops rows AFTER the window is chosen, so a 40-row window
  // can hand back 37 hits. Paging on 37 would re-fetch the 3 that were skipped.
  assert.equal(nextSuggestionOffset(0, 40), 40);
  assert.equal(nextSuggestionOffset(40, 40), 80);
  assert.equal(nextSuggestionOffset(280, 40), MAX_SUGGESTIONS);
  assert.equal(nextSuggestionOffset(300, 40), MAX_SUGGESTIONS, "never past the ceiling");
  assert.equal(nextSuggestionOffset(-10, -10), 0);
});

test("a short window means the index ran out; a full one means keep going", () => {
  assert.equal(hasMoreSuggestions({ nextOffset: 40, consumed: 40, requested: 40 }), true);
  assert.equal(hasMoreSuggestions({ nextOffset: 37, consumed: 37, requested: 40 }), false);
  assert.equal(
    hasMoreSuggestions({ nextOffset: MAX_SUGGESTIONS, consumed: 40, requested: 40 }),
    false,
    "the ceiling stops it even with a full window"
  );
  assert.equal(hasMoreSuggestions({ nextOffset: 0, consumed: 0, requested: 0 }), false);
});

test("a full walk to the ceiling is exactly eight requests", () => {
  let offset = 0;
  let requests = 0;
  while (true) {
    const requested = suggestionPageSize(offset);
    if (requested === 0) break;
    requests += 1;
    const next = nextSuggestionOffset(offset, requested);
    if (!hasMoreSuggestions({ nextOffset: next, consumed: requested, requested })) {
      offset = next;
      break;
    }
    offset = next;
  }
  assert.equal(requests, 8);
  assert.equal(offset, MAX_SUGGESTIONS);
});

test("the request URL carries only bounded parameters", () => {
  assert.equal(suggestionRequestUrl("oven", 0), "/api/search?q=oven&limit=40");
  assert.equal(suggestionRequestUrl("oven", 280), "/api/search?q=oven&limit=40&offset=280");
  assert.equal(suggestionRequestUrl("oven", 300), "/api/search?q=oven&limit=20&offset=300");
  assert.equal(suggestionRequestUrl("oven", 9999), "/api/search?q=oven&limit=0&offset=320");
  assert.match(suggestionRequestUrl("a b&c=1", 0), /^\/api\/search\?q=a\+b%26c%3D1&limit=40$/);
});

test("every URL the dropdown builds survives the endpoint's own clamps", () => {
  // The client is not trusted: the endpoint re-applies the bounds. This asserts
  // the two agree, so a legitimate scroll is never silently short-changed.
  for (let offset = 0; offset < MAX_SUGGESTIONS; offset += SUGGESTIONS_PER_PAGE) {
    const url = suggestionRequestUrl("oven", offset);
    const parsed = parsePublicSearchParams(new URLSearchParams(url.split("?")[1]));
    assert.equal(parsed.offset, offset, `offset at ${offset}`);
    assert.equal(parsed.limit, suggestionPageSize(offset), `limit at ${offset}`);
    assert.ok(parsed.offset + parsed.limit <= MAX_SUGGESTIONS, `window at ${offset}`);
  }
});

test("a hand-crafted request cannot reach past the ceiling either", () => {
  const parse = (qs: string) => parsePublicSearchParams(new URLSearchParams(qs));
  const deep = parse(`q=oven&offset=999999&limit=${MAX_LIMIT}`);
  assert.ok(deep.offset + deep.limit <= MAX_SUGGESTIONS);
  const edge = parse("q=oven&offset=319&limit=50");
  assert.equal(edge.offset, 319);
  assert.equal(edge.limit, 1);
});
