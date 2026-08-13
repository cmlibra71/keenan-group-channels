import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBrandFreeShippingSpecials,
  isSpecialActive,
  activeSpecials,
  matchBrandSpecial,
  brandFreeShippingMessage,
  todayInMelbourne,
  type BrandFreeShippingSpecial,
} from "./free-shipping-brands-policy.ts";

const special = (over: Partial<BrandFreeShippingSpecial> = {}): BrandFreeShippingSpecial => ({
  id: "s1",
  brand_id: 42,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  enabled: true,
  ...over,
});

// ── parse ───────────────────────────────────────────────────────────────────

test("parse reads well-formed rows and defaults enabled to true", () => {
  const rows = parseBrandFreeShippingSpecials([
    { id: "a", brand_id: 7, start_date: "2026-08-01", end_date: "2026-08-31" },
  ]);
  assert.deepEqual(rows, [
    { id: "a", brand_id: 7, start_date: "2026-08-01", end_date: "2026-08-31", enabled: true },
  ]);
});

test("parse tolerates a missing or non-array setting", () => {
  assert.deepEqual(parseBrandFreeShippingSpecials(null), []);
  assert.deepEqual(parseBrandFreeShippingSpecials(undefined), []);
  assert.deepEqual(parseBrandFreeShippingSpecials("[]"), []);
  assert.deepEqual(parseBrandFreeShippingSpecials({ brand_id: 1 }), []);
});

test("parse drops rows with no usable brand id", () => {
  const rows = parseBrandFreeShippingSpecials([
    { brand_id: 0 },
    { brand_id: -3 },
    { brand_id: "abc" },
    { brand_id: 1.5 },
    null,
    "nope",
    { brand_id: 9 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.brand_id),
    [9]
  );
});

test("parse turns empty-string dates into open bounds", () => {
  const [row] = parseBrandFreeShippingSpecials([{ brand_id: 5, start_date: "", end_date: "" }]);
  assert.equal(row.start_date, null);
  assert.equal(row.end_date, null);
});

// ── active window ───────────────────────────────────────────────────────────

test("both bounds are inclusive", () => {
  assert.equal(isSpecialActive(special(), "2026-08-01"), true);
  assert.equal(isSpecialActive(special(), "2026-08-31"), true);
  assert.equal(isSpecialActive(special(), "2026-08-15"), true);
});

test("outside the window it is off", () => {
  assert.equal(isSpecialActive(special(), "2026-07-31"), false);
  assert.equal(isSpecialActive(special(), "2026-09-01"), false);
});

test("disabled beats the dates", () => {
  assert.equal(isSpecialActive(special({ enabled: false }), "2026-08-15"), false);
});

test("an absent bound is open-ended", () => {
  assert.equal(isSpecialActive(special({ start_date: null }), "2020-01-01"), true);
  assert.equal(isSpecialActive(special({ end_date: null }), "2099-01-01"), true);
});

test("an unreadable date switches the special OFF, never to open-ended", () => {
  assert.equal(isSpecialActive(special({ start_date: "1 Aug 2026" }), "2026-08-15"), false);
  assert.equal(isSpecialActive(special({ end_date: "31/08/2026" }), "2026-08-15"), false);
});

test("activeSpecials keeps configured order and drops the rest", () => {
  const rows = [
    special({ id: "past", brand_id: 1, end_date: "2026-08-01" }),
    special({ id: "now", brand_id: 2 }),
    special({ id: "future", brand_id: 3, start_date: "2026-12-01", end_date: "2026-12-31" }),
    special({ id: "now2", brand_id: 4 }),
  ];
  assert.deepEqual(
    activeSpecials(rows, "2026-08-15").map((s) => s.id),
    ["now", "now2"]
  );
});

// ── cart matching ───────────────────────────────────────────────────────────

const promoted = [
  { brandId: 42, brandName: "Robot Coupe", endDate: "2026-08-31" },
  { brandId: 77, brandName: "Waldorf", endDate: null },
];

test("one promoted line in a mixed cart makes the whole order free", () => {
  const match = matchBrandSpecial(promoted, [11, 42, 12]);
  assert.equal(match?.brandId, 42);
});

test("no promoted line means no free delivery", () => {
  assert.equal(matchBrandSpecial(promoted, [11, 12]), null);
});

test("unbranded lines and an empty cart never match", () => {
  assert.equal(matchBrandSpecial(promoted, [null, undefined]), null);
  assert.equal(matchBrandSpecial(promoted, []), null);
});

test("with no active specials nothing matches", () => {
  assert.equal(matchBrandSpecial([], [42]), null);
});

test("the first configured special wins when the cart matches two", () => {
  assert.equal(matchBrandSpecial(promoted, [77, 42])?.brandId, 42);
});

// ── message ─────────────────────────────────────────────────────────────────

test("the message names the brand, and survives a missing name", () => {
  assert.equal(
    brandFreeShippingMessage(promoted[0]),
    "Free delivery on this order — Robot Coupe free shipping special."
  );
  assert.equal(
    brandFreeShippingMessage({ brandId: 1, brandName: null, endDate: null }),
    "Free delivery on this order — free shipping special."
  );
});

// ── clock ───────────────────────────────────────────────────────────────────

test("today is the MELBOURNE date, not the UTC one", () => {
  // 2026-08-31T23:00Z is already 1 Sep in Melbourne (UTC+10), so an August
  // special has ended for a shopper looking at the site.
  assert.equal(todayInMelbourne(new Date("2026-08-31T23:00:00Z")), "2026-09-01");
  assert.equal(todayInMelbourne(new Date("2026-08-31T13:00:00Z")), "2026-08-31");
  assert.equal(isSpecialActive(special(), todayInMelbourne(new Date("2026-08-31T23:00:00Z"))), false);
});
