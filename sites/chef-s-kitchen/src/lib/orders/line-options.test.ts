import { test } from "node:test";
import assert from "node:assert/strict";
import { optionSummary } from "./line-options.ts";

test("a Zoey-synced ARRAY of variant options still reads", () => {
  assert.equal(
    optionSummary([
      { display_name: "Colour", display_value: "Stainless" },
      { name: "Size", value: "600mm" },
    ]),
    "Colour: Stainless · Size: 600mm"
  );
});

test("the checkout's OBJECT of paid extras reads too — it used to render nothing", () => {
  // Card 0CDcCYmO: `buildLineItems` writes this shape, and the portal's lines table renders
  // it. The customer's own copy of the same order showed a blank, so a line priced $725 above
  // the catalogue had no explanation anywhere the buyer could see.
  assert.equal(
    optionSummary({ Slicers: "Slicer 4mm (+$245.00)", "Feed hopper": "Large hopper (+$480.00)" }),
    "Slicers: Slicer 4mm (+$245.00) · Feed hopper: Large hopper (+$480.00)"
  );
});

test("a value with no name still prints, in both shapes", () => {
  assert.equal(optionSummary([{ display_value: "Stainless" }]), "Stainless");
  assert.equal(optionSummary({ "": "Stainless" }), "Stainless");
});

test("empty, absent and unreadable all read as nothing", () => {
  assert.equal(optionSummary(null), "");
  assert.equal(optionSummary(undefined), "");
  assert.equal(optionSummary([]), "");
  assert.equal(optionSummary({}), "");
  assert.equal(optionSummary("Slicer 4mm"), "");
  assert.equal(optionSummary(7), "");
});

test("a nested bag is skipped, never printed as [object Object]", () => {
  assert.equal(optionSummary({ Slicers: { key: "s4" }, "Feed hopper": "Large" }), "Feed hopper: Large");
});

test("a blank value is dropped rather than printed as a bare label", () => {
  assert.equal(optionSummary({ Slicers: "   ", "Feed hopper": "Large" }), "Feed hopper: Large");
  assert.equal(optionSummary([{ display_name: "Colour", display_value: "" }]), "");
});

test("a numeric value prints", () => {
  assert.equal(optionSummary({ Blades: 4 }), "Blades: 4");
});
