import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MISSING_VALUE,
  buildCompareRows,
  comparableDefinitions,
  zoeyCodeOf,
  type CompareFieldDefinition,
} from "./compare-rows.ts";

// The live channel-1 definitions for the two combi ovens compared on the old site.
const defs: CompareFieldDefinition[] = [
  { code: "fuel_type", label: "Fuel Type", sourceId: "product-attr:fuel_type", sortOrder: 1034 },
  { code: "tray", label: "Trays per oven", sourceId: "product-attr:tray", sortOrder: 1017 },
  { code: "tray_size", label: "Tray Size", sourceId: "product-attr:tray_size", sortOrder: 1018 },
  // Imported, but NOT comparable in Zoey — never a row.
  { code: "price_suffix", label: "Price Suffix", sourceId: "product-attr:price_suffix", sortOrder: 1004 },
  { code: "zoey_visibility", label: "Zoey visibility", sourceId: "product-attr:visibility", sortOrder: 1088 },
  // Renamed on import: matched on the Zoey code in source_id, printed under our code.
  { code: "equipment_type", label: "Type", sourceId: "product-attr:type", sortOrder: 1061 },
  { code: "width", label: "Width", sourceId: "product-attr:width_1", sortOrder: 1033 },
  // An authored field (no Zoey source) is not a Zoey comparable attribute.
  { code: "spec_sheet", label: "Spec sheet", sourceId: null, sortOrder: 1 },
];

test("the Zoey code comes from source_id", () => {
  assert.equal(zoeyCodeOf({ sourceId: "product-attr:width_1" }), "width_1");
  assert.equal(zoeyCodeOf({ sourceId: null }), null);
  assert.equal(zoeyCodeOf({ sourceId: "other:x" }), null);
});

test("only Zoey-comparable definitions, in attribute order", () => {
  assert.deepEqual(
    comparableDefinitions(defs).map((d) => d.code),
    ["tray", "tray_size", "width", "fuel_type", "equipment_type"]
  );
});

test("matches the old site: a shared row, and N/A where one product has no value", () => {
  const alto = { tray: "40 tray", tray_size: "GN 2/1", zoey_visibility: "both" };
  const capic = { tray: "80 tray", fuel_type: "Electric", tray_size: "GN 2/1", price_suffix: "each" };
  assert.deepEqual(buildCompareRows(defs, [alto, capic]), [
    { code: "tray", label: "Trays per oven", values: ["40 tray", "80 tray"] },
    { code: "tray_size", label: "Tray Size", values: ["GN 2/1", "GN 2/1"] },
    { code: "fuel_type", label: "Fuel Type", values: [MISSING_VALUE, "Electric"] },
  ]);
});

test("no rows for products carrying no comparable values", () => {
  assert.deepEqual(buildCompareRows(defs, [null, {}, { price_suffix: "each" }]), []);
});

test("a select value prints its option label; blanks and odd shapes are empty", () => {
  const withOptions: CompareFieldDefinition[] = [
    {
      code: "doors",
      label: "Doors",
      sourceId: "product-attr:doors",
      sortOrder: 1,
      options: [{ value: "2", label: "2 Doors" }],
    },
  ];
  assert.deepEqual(buildCompareRows(withOptions, [{ doors: "2" }, { doors: "  " }, { doors: { x: 1 } }]), [
    { code: "doors", label: "Doors", values: ["2 Doors", MISSING_VALUE, MISSING_VALUE] },
  ]);
  assert.deepEqual(buildCompareRows(withOptions, [{ doors: ["2", "3"] }]), [
    { code: "doors", label: "Doors", values: ["2 Doors, 3"] },
  ]);
});
