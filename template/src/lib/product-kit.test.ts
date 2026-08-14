import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultKitSelection,
  describeKitChoices,
  describeKitContents,
  readProductKit,
  resolveKitChoices,
  toKitChoices,
} from "./product-kit.ts";

const bundleMeta = {
  product_kind: "bundle",
  kit: {
    items: [
      { product_id: 11, sku: "L-GLASS", name: "Left bay glass door", quantity: 1, group: "Left bay" },
      { product_id: 12, sku: "L-SOLID", name: "Left bay solid door", quantity: 1, group: "Left bay", is_default: true },
      { product_id: 21, sku: "R-GLASS", name: "Right bay glass door", quantity: 1, group: "Right bay" },
      { product_id: 22, sku: "R-SOLID", name: "Right bay solid door", quantity: 1, group: "Right bay" },
    ],
  },
};

const groupedMeta = {
  product_kind: "grouped",
  kit: {
    items: [
      { product_id: 5, sku: "BENCH", name: "Prep bench", quantity: 1 },
      { product_id: 6, sku: "SHELF", name: "Under shelf", quantity: 2 },
    ],
  },
};

test("a product with no kit is not a kit", () => {
  for (const input of [null, undefined, 0, "x", [], {}, { kit: null }, { kit: { items: [] } }]) {
    assert.equal(readProductKit(input), null);
  }
});

test("reads a bundle into its choice groups, in author order", () => {
  const kit = readProductKit(bundleMeta)!;
  assert.equal(kit.kind, "bundle");
  assert.deepEqual(kit.groups.map((g) => g.name), ["Left bay", "Right bay"]);
  assert.equal(kit.groups[0].items.length, 2);
});

test("reads a grouped kit as one fixed set with no choices", () => {
  const kit = readProductKit(groupedMeta)!;
  assert.equal(kit.kind, "grouped");
  assert.equal(kit.groups.length, 0);
  assert.equal(kit.items.length, 2);
  assert.equal(describeKitContents(kit), "1 × Prep bench (BENCH)\n2 × Under shelf (SHELF)");
});

test("survives a metafields blob that arrives as a JSON string", () => {
  const kit = readProductKit(JSON.stringify(bundleMeta))!;
  assert.equal(kit.kind, "bundle");
  assert.equal(kit.groups.length, 2);
});

test("derives the kind from the rows when nobody declared one", () => {
  assert.equal(readProductKit({ kit: bundleMeta.kit })!.kind, "bundle");
  assert.equal(readProductKit({ kit: groupedMeta.kit })!.kind, "grouped");
});

test("starts a bundle on each group's default, else its first product", () => {
  const kit = readProductKit(bundleMeta)!;
  assert.deepEqual(defaultKitSelection(kit.groups), { "Left bay": 12, "Right bay": 21 });
});

test("resolves a complete selection against the product's OWN kit", () => {
  const kit = readProductKit(bundleMeta)!;
  const choices = resolveKitChoices(kit, toKitChoices({ "Left bay": 11, "Right bay": 22 }))!;
  assert.deepEqual(
    choices.map((c) => `${c.group}=${c.sku}`),
    ["Left bay=L-GLASS", "Right bay=R-SOLID"]
  );
  assert.equal(
    describeKitChoices(choices),
    "Left bay: Left bay glass door (L-GLASS)\nRight bay: Right bay solid door (R-SOLID)"
  );
});

test("refuses a selection that doesn't answer every group exactly once", () => {
  const kit = readProductKit(bundleMeta)!;
  assert.equal(resolveKitChoices(kit, [{ group: "Left bay", product_id: 11 }]), null);
  assert.equal(resolveKitChoices(kit, null), null);
  assert.equal(
    resolveKitChoices(kit, [
      { group: "Left bay", product_id: 11 },
      { group: "Left bay", product_id: 12 },
      { group: "Right bay", product_id: 21 },
    ]),
    null
  );
});

test("refuses a product that isn't offered in the group it was submitted under", () => {
  const kit = readProductKit(bundleMeta)!;
  // 21 belongs to Right bay — sending it as the Left bay answer must not be accepted.
  assert.equal(
    resolveKitChoices(kit, [
      { group: "Left bay", product_id: 21 },
      { group: "Right bay", product_id: 21 },
    ]),
    null
  );
});

test("a grouped kit has no configuration to resolve", () => {
  const kit = readProductKit(groupedMeta)!;
  assert.equal(resolveKitChoices(kit, []), null);
});
