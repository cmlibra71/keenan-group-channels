import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultKitSelection,
  kitSelectionReady,
  tileKitChoices,
  toggleKitSelection,
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
  assert.deepEqual(defaultKitSelection(kit.groups), { "Left bay": [12], "Right bay": [21] });
});

test("resolves a complete selection against the product's OWN kit", () => {
  const kit = readProductKit(bundleMeta)!;
  const choices = resolveKitChoices(kit, toKitChoices({ "Left bay": [11], "Right bay": [22] }))!;
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

// ── Group rules + per-storefront kits (IK Zoey bundles, 2026-09-28) ─────────────────────────

/** HOS-IM-240ANE-28-BUNDLE's shape: an always-included head unit, then two optional groups. */
const zoeyBundle = {
  product_kind: "bundle",
  kit: {
    items: [
      { product_id: 1, sku: "IM-240", name: "Ice maker", quantity: 1, group: "Ice Maker" },
      { product_id: 2, sku: "B-301", name: "Bin 301", quantity: 1, group: "Storage Bin" },
      { product_id: 3, sku: "B-501", name: "Bin 501", quantity: 1, group: "Storage Bin" },
      { product_id: 4, sku: "TK-8D", name: "Top kit 8D", quantity: 1, group: "Accessories", is_default: true },
      { product_id: 5, sku: "HLF20", name: "Filter", quantity: 1, group: "Accessories" },
    ],
    groups: [
      { name: "Ice Maker", mode: "included", required: true },
      { name: "Storage Bin", mode: "one", required: false },
      { name: "Accessories", mode: "many", required: false },
    ],
  },
  quote_only: true,
};
const scopedMeta = { kit: groupedMeta.kit, product_kind: "grouped", channel_kits: { "1": zoeyBundle } };

test("a storefront's OWN kit wins over the shared one; any other storefront reads the shared kit", () => {
  const ik = readProductKit(scopedMeta, 1)!;
  assert.equal(ik.kind, "bundle");
  assert.equal(ik.scoped, true);
  assert.equal(ik.quoteOnly, true);
  const cd = readProductKit(scopedMeta, 2)!;
  assert.equal(cd.kind, "grouped");
  assert.equal(cd.scoped, false);
  assert.equal(cd.quoteOnly, false);
  assert.equal(readProductKit(scopedMeta)!.kind, "grouped");
  assert.equal(readProductKit({ channel_kits: { "1": zoeyBundle } }, 2), null);
  assert.equal(readProductKit({ channel_kits: { "1": zoeyBundle } }), null);
});

test("quote_only is only honoured on a scoped kit", () => {
  assert.equal(readProductKit({ ...bundleMeta, quote_only: true })!.quoteOnly, false);
});

test("group rules read through; a rule-less group stays a required pick-one", () => {
  const kit = readProductKit(scopedMeta, 1)!;
  assert.deepEqual(kit.groups.map((g) => `${g.name}:${g.mode}:${g.required}`), [
    "Ice Maker:included:true",
    "Storage Bin:one:false",
    "Accessories:many:false",
  ]);
  const legacy = readProductKit(bundleMeta)!;
  assert.deepEqual(legacy.groups.map((g) => `${g.mode}:${g.required}`), ["one:true", "one:true"]);
});

test("starts on None for an optional pick-one and on the pre-ticks of a tick-box group", () => {
  const kit = readProductKit(scopedMeta, 1)!;
  assert.deepEqual(defaultKitSelection(kit.groups), { Accessories: [4] });
  assert.equal(kitSelectionReady(kit, {}), true);
});

test("toggle: pick-one replaces, None clears an optional one, tick boxes toggle, included ignores", () => {
  const kit = readProductKit(scopedMeta, 1)!;
  let sel = toggleKitSelection(kit, {}, "Storage Bin", 2);
  sel = toggleKitSelection(kit, sel, "Storage Bin", 3);
  assert.deepEqual(sel["Storage Bin"], [3]);
  sel = toggleKitSelection(kit, sel, "Storage Bin", null);
  assert.deepEqual(sel["Storage Bin"], []);
  sel = toggleKitSelection(kit, sel, "Accessories", 4);
  sel = toggleKitSelection(kit, sel, "Accessories", 5);
  assert.deepEqual(sel.Accessories, [4, 5]);
  sel = toggleKitSelection(kit, sel, "Accessories", 4);
  assert.deepEqual(sel.Accessories, [5]);
  assert.equal(toggleKitSelection(kit, sel, "Ice Maker", 1), sel);
  assert.equal(toggleKitSelection(kit, sel, "Storage Bin", 99), sel);
  // A required pick-one cannot be cleared.
  const legacy = readProductKit(bundleMeta)!;
  const start = defaultKitSelection(legacy.groups);
  assert.equal(toggleKitSelection(legacy, start, "Left bay", null), start);
});

test("resolve: included rows always, optional groups skippable, tick boxes several, in author order", () => {
  const kit = readProductKit(scopedMeta, 1)!;
  const none = resolveKitChoices(kit, [])!;
  assert.deepEqual(none.map((c) => c.sku), ["IM-240"]);
  const full = resolveKitChoices(kit, [
    { group: "Accessories", product_id: 5 },
    { group: "Accessories", product_id: 4 },
    { group: "Storage Bin", product_id: 3 },
    { group: "Ice Maker", product_id: 999 },
  ])!;
  assert.deepEqual(full.map((c) => c.sku), ["IM-240", "B-501", "TK-8D", "HLF20"]);
  assert.equal(
    describeKitChoices(full),
    "Ice Maker: Ice maker (IM-240)\nStorage Bin: Bin 501 (B-501)\nAccessories: Top kit 8D (TK-8D)\nAccessories: Filter (HLF20)"
  );
  assert.equal(resolveKitChoices(kit, [{ group: "Storage Bin", product_id: 2 }, { group: "Storage Bin", product_id: 3 }]), null);
  assert.equal(resolveKitChoices(kit, [{ group: "Accessories", product_id: 2 }]), null);
});

test("a required tick-box group needs at least one tick", () => {
  const meta = {
    channel_kits: {
      "1": {
        product_kind: "bundle",
        kit: { items: zoeyBundle.kit.items, groups: [{ name: "Accessories", mode: "many", required: true }] },
      },
    },
  };
  const kit = readProductKit(meta, 1)!;
  assert.equal(kitSelectionReady(kit, { "Ice Maker": [1], "Storage Bin": [2] }), false);
});

test("a tile sends the default build of a scoped kit, and nothing for a shared kit", () => {
  assert.deepEqual(tileKitChoices(readProductKit(scopedMeta, 1)!), [{ group: "Accessories", product_id: 4 }]);
  assert.equal(tileKitChoices(readProductKit(bundleMeta)!), null);
  // A required pick-one with no MARKED default cannot be answered from a tile.
  const noDefault = {
    channel_kits: { "1": { product_kind: "bundle", kit: { items: zoeyBundle.kit.items.slice(0, 3) } } },
  };
  assert.equal(tileKitChoices(readProductKit(noDefault, 1)!), null);
});
