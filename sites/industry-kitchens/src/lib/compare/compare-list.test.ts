import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPARE_COOKIE,
  MAX_COMPARE_ITEMS,
  MAX_PRODUCT_ID,
  addToCompareList,
  formatCompareList,
  parseCompareList,
  readCompareCookie,
  removeFromCompareList,
  serializeCompareCookie,
} from "./compare-list.ts";

test("parse keeps positive whole ids, newest first, without duplicates", () => {
  assert.deepEqual(parseCompareList("5,3,5,x,-1,0,7"), [5, 3, 7]);
  assert.deepEqual(parseCompareList(""), []);
  assert.deepEqual(parseCompareList(undefined), []);
  assert.deepEqual(parseCompareList("5%2C3"), [5, 3]);
  assert.deepEqual(parseCompareList("%E0%A4%A"), []);
});

test("parse is capped, so a hand-edited cookie cannot make the page read more", () => {
  const long = Array.from({ length: 20 }, (_, i) => i + 1).join(",");
  assert.equal(parseCompareList(long).length, MAX_COMPARE_ITEMS);
});

test("add puts the product first, moves a repeat, and drops the oldest past the cap", () => {
  assert.deepEqual(addToCompareList([], 4), [4]);
  assert.deepEqual(addToCompareList([1, 2, 3], 2), [2, 1, 3]);
  const full = Array.from({ length: MAX_COMPARE_ITEMS }, (_, i) => i + 1);
  const next = addToCompareList(full, 99);
  assert.equal(next.length, MAX_COMPARE_ITEMS);
  assert.equal(next[0], 99);
  assert.ok(!next.includes(MAX_COMPARE_ITEMS), "the oldest entry is the one dropped");
  assert.deepEqual(addToCompareList([1], 0), [1]);
});

test("remove takes one id out", () => {
  assert.deepEqual(removeFromCompareList([3, 2, 1], 2), [3, 1]);
  assert.deepEqual(removeFromCompareList([3], 9), [3]);
});

test("the cookie round-trips, and an empty list expires it", () => {
  assert.equal(formatCompareList([3, 1]), "3,1");
  const set = serializeCompareCookie([3, 1]);
  assert.match(set, new RegExp(`^${COMPARE_COOKIE}=3,1; path=/; max-age=\\d+; samesite=lax$`));
  assert.match(serializeCompareCookie([]), /max-age=0/);
  assert.equal(readCompareCookie(`a=1; ${COMPARE_COOKIE}=3,1; gst_inclusive=true`), "3,1");
  assert.equal(readCompareCookie("a=1"), null);
  assert.deepEqual(parseCompareList(readCompareCookie(`${COMPARE_COOKIE}=3,1`)), [3, 1]);
});

test("ids beyond Postgres int4 are dropped, so a tampered cookie cannot fail the page", () => {
  assert.deepEqual(parseCompareList("2147483648"), []);
  assert.deepEqual(parseCompareList("9999999999"), []);
  assert.deepEqual(parseCompareList("6093,2147483648"), [6093]);
  assert.deepEqual(parseCompareList(String(MAX_PRODUCT_ID)), [MAX_PRODUCT_ID]);
  assert.deepEqual(parseCompareList("99999999999999999999,5"), [5]);
  assert.deepEqual(addToCompareList([1], MAX_PRODUCT_ID + 1), [1]);
});
