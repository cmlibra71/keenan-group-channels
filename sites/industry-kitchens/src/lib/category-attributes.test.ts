import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attrSlug,
  attributeParam,
  formatPriceLabel,
  formatRangeLabel,
  parseAttributeSelections,
  parsePriceBands,
  parseRangeParam,
  priceBandWindow,
  rangeParamFor,
  sliderTravel,
  type AttributeFacet,
} from "./category-attributes";

const width: AttributeFacet = { code: "width", label: "Width", kind: "range", unit: "mm", min: 600, max: 2100 };
const doors: AttributeFacet = {
  code: "doors",
  label: "Doors",
  kind: "options",
  options: [
    { value: "1-door", label: "1 Door", count: 3 },
    { value: "2-door", label: "2 Door", count: 4 },
  ],
};

test("params are namespaced so they cannot collide with sub/brand/price", () => {
  assert.equal(attributeParam("width"), "f_width");
  assert.equal(attrSlug("2 Half Door"), "2-half-door");
});

test("a range param reads both ends, either open", () => {
  assert.deepEqual(parseRangeParam("600-900"), { min: 600, max: 900 });
  assert.deepEqual(parseRangeParam("600-"), { min: 600, max: undefined });
  assert.deepEqual(parseRangeParam("-900"), { min: undefined, max: 900 });
});

test("a mangled range is ignored rather than half-applied", () => {
  for (const raw of ["900-600", "-", "", "wide", "600", null, undefined]) {
    assert.equal(parseRangeParam(raw), undefined, `${raw}`);
  }
});

test("a thumb left at the end applies no bound, and both ends clear the filter", () => {
  assert.equal(rangeParamFor(width, { min: 600, max: 2100 }), null, "untouched = no filter");
  assert.equal(rangeParamFor(width, { min: 900, max: 2100 }), "900-");
  assert.equal(rangeParamFor(width, { min: 600, max: 1200 }), "-1200");
  assert.equal(rangeParamFor(width, { min: 900, max: 1200 }), "900-1200");
});

test("a thumb dragged past the travel still reads as no bound", () => {
  assert.equal(rangeParamFor(width, { min: 500, max: 2500 }), null);
});

test("selections are read per facet, by that facet's own kind", () => {
  const params: Record<string, string> = {
    f_width: "600-900",
    f_doors: "2-Door,2-door,1-door",
    brand: "12",
  };
  assert.deepEqual(parseAttributeSelections([width, doors], (p) => params[p]), {
    width: { min: 600, max: 900 },
    doors: ["2-door", "1-door"],
  });
});

test("a range value on an options facet is read as a slug, not a window", () => {
  assert.deepEqual(parseAttributeSelections([doors], () => "600-900"), { doors: ["600-900"] });
});

test("labels read the way a chip should", () => {
  assert.equal(formatRangeLabel({ min: 600, max: 900 }, "mm"), "600–900mm");
  assert.equal(formatRangeLabel({ min: 900 }, "mm"), "900mm and up");
  assert.equal(formatRangeLabel({ max: 900 }, "mm"), "up to 900mm");
  assert.equal(formatPriceLabel({ min: 1000, max: 3000 }), "$1,000–$3,000");
  assert.equal(formatPriceLabel({ min: 1000 }), "$1,000 and up");
});

test("only the three real price bands survive parsing", () => {
  assert.deepEqual(parsePriceBands("lt1000,gt3000,nonsense"), ["lt1000", "gt3000"]);
  assert.deepEqual(parsePriceBands("1000-3000"), [], "a slider window is not a band");
});

test("a legacy price band still has a window the slider can show", () => {
  // A shared ?price=lt1000 link narrows the grid server-side. Before this, the
  // slider sat at full travel and drew no chip, so the rail said "no price
  // filter" while one was applied.
  assert.deepEqual(priceBandWindow(["lt1000"]), { min: undefined, max: 1000 });
  assert.deepEqual(priceBandWindow(["gt3000"]), { min: 3000, max: undefined });
  assert.deepEqual(priceBandWindow(["1000to3000"]), { min: 1000, max: 3000 });
  assert.deepEqual(priceBandWindow(["lt1000", "1000to3000"]), { min: undefined, max: 3000 });
  assert.equal(priceBandWindow([]), undefined);
  // Both ends open is not a window the slider can draw — the chips carry it.
  assert.equal(priceBandWindow(["lt1000", "gt3000"]), undefined);
});

test("the travel leaves an ordinary window exactly where it is", () => {
  // Nothing to widen: the window sits inside the percentile travel, so the low
  // thumb parks on the travel end (no lower bound) and the high thumb on 900.
  const t = sliderTravel({ min: 400, max: 1200 }, { max: 900 });
  assert.equal(t.min, 400);
  assert.ok(t.max >= 1200);
});

test("a window BELOW the travel drags the travel down to meet it", () => {
  // The live defect: Chefs Depot ?f_doors=2-door&price=lt1000 — travel $1,600
  // to $14,750 (the 2-door shelf's 1st-99th percentile), window "under $1,000".
  // Both thumbs used to clamp to $1,600, so the slider read "$1,600 - $1,600"
  // under a chip saying "Under $1,000".
  const t = sliderTravel({ min: 1600, max: 14750 }, { max: 1000 });
  assert.equal(t.min, 0, "an open floor is drawn at zero, not at the window top");
  assert.ok(t.max >= 14750);
  const lo = Math.max(t.min, Math.min(t.max, t.min));
  const hi = Math.min(t.max, Math.max(t.min, 1000));
  assert.equal(lo, 0);
  assert.equal(hi, 1000);
  assert.notEqual(lo, hi, "the two thumbs must not sit on top of each other");
});

test("a window ABOVE the travel drags the travel up to meet it", () => {
  const t = sliderTravel({ min: 400, max: 1200 }, { min: 2000 });
  assert.ok(t.max > 2000, "the open ceiling has to sit above the window floor");
  assert.equal(t.min, 400);
});

test("a two-sided window below the travel is contained without reaching zero", () => {
  const t = sliderTravel({ min: 1600, max: 14750 }, { min: 200, max: 1000 });
  assert.equal(t.min, 200);
  assert.ok(t.max >= 14750);
});

test("the travel top always lands on the step grid", () => {
  for (const range of [
    { min: 0, max: 14750 },
    { min: 400, max: 1201 },
    { min: 1.05, max: 9.7 },
    { min: 12, max: 143 },
  ]) {
    const t = sliderTravel(range);
    assert.ok(t.max >= range.max, "the travel may only widen, never narrow");
    const steps = (t.max - t.min) / t.step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${t.max} is off the step grid`);
  }
});
