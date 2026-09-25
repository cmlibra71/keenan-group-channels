import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bundlePartNote,
  bundleParts,
  bundleProductPath,
  defaultBuildTotal,
  defaultKitSelection,
  describeKitChoices,
  describeKitContents,
  isFixedGroup,
  kitBuildTotal,
  kitQuestions,
  memberPriceMapWithKit,
  memberPriceWithKit,
  offeredKit,
  readProductKit,
  resolveKitChoices,
  toKitChoices,
  unbuyableBundlePart,
  withKitPrice,
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

// ── Card Tc5ekvD6: optional groups, always-included parts, Zoey's dynamic price ─────────────────

// The Hoshizaki KMD-270AB shape Zoey holds: the ice maker always included, a storage bin and a
// top kit each optional.
const iceMakerMeta = {
  product_kind: "bundle",
  kit: {
    items: [
      { product_id: 100, sku: "HOS-91000905", name: "KMD-270AB ice maker", quantity: 1, group: "Ice Maker" },
      { product_id: 201, sku: "B-301", name: "Bin 301", quantity: 1, group: "Storage Bin" },
      { product_id: 202, sku: "B-501", name: "Bin 501", quantity: 1, group: "Storage Bin" },
      { product_id: 301, sku: "TK-8D", name: "Top kit 8D", quantity: 2, group: "Accessories" },
    ],
    optional_groups: ["Storage Bin", "Accessories", "Not a group"],
  },
};

test("optional groups are read from the kit, and a required one-product group is a fixed part", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.deepEqual(
    kit.groups.map((g) => [g.name, g.optional, isFixedGroup(g)]),
    [
      ["Ice Maker", false, true],
      ["Storage Bin", true, false],
      ["Accessories", true, false],
    ]
  );
});

test("an optional group starts on nothing unless the author marked a default — a charge nobody asked for is never preselected", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.deepEqual(defaultKitSelection(kit.groups), { "Ice Maker": 100 });
  const withDefault = readProductKit({
    ...iceMakerMeta,
    kit: {
      ...iceMakerMeta.kit,
      items: iceMakerMeta.kit.items.map((i) => (i.product_id === 202 ? { ...i, is_default: true } : i)),
    },
  })!;
  assert.deepEqual(defaultKitSelection(withDefault.groups), { "Ice Maker": 100, "Storage Bin": 202 });
});

test("an optional group may be left out; a required one may not", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.deepEqual(
    resolveKitChoices(kit, [{ group: "Ice Maker", product_id: 100 }])!.map((c) => c.sku),
    ["HOS-91000905"]
  );
  assert.equal(resolveKitChoices(kit, [{ group: "Storage Bin", product_id: 201 }]), null);
  assert.deepEqual(
    resolveKitChoices(kit, toKitChoices({ "Ice Maker": 100, "Storage Bin": 202, Accessories: 301 }))!.map(
      (c) => `${c.group}=${c.sku}x${c.quantity}`
    ),
    ["Ice Maker=HOS-91000905x1", "Storage Bin=B-501x1", "Accessories=TK-8Dx2"]
  );
});

test("a choice naming a group the bundle does not have is refused, not ignored", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.equal(
    resolveKitChoices(kit, [
      { group: "Ice Maker", product_id: 100 },
      { group: "Free gift", product_id: 999 },
    ]),
    null
  );
});

test("no choices at all (a tile with no picker) is never a build — even for an all-optional bundle", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.equal(resolveKitChoices(kit, null), null);
  assert.equal(resolveKitChoices(kit, undefined), null);
});

test("the questions a page with no picker has to name are the required groups with a real choice", () => {
  assert.deepEqual(kitQuestions(readProductKit(bundleMeta)!), ["Left bay", "Right bay"]);
  assert.deepEqual(kitQuestions(readProductKit(iceMakerMeta)!), []);
});

test("the build total is each chosen part at this shopper's unit price times the kit quantity", () => {
  const kit = readProductKit(iceMakerMeta)!;
  const prices = { 100: 5716.74, 201: 1313.14, 202: 1665.56, 301: 159.35 };
  assert.equal(kitBuildTotal(kit, { "Ice Maker": 100 }, prices), 5716.74);
  assert.equal(kitBuildTotal(kit, { "Ice Maker": 100, "Storage Bin": 202, Accessories: 301 }, prices), 7701); // 5716.74 + 1665.56 + 2 × 159.35
});

test("a chosen part with no price online leaves the build without a total — never a total short a part", () => {
  const kit = readProductKit(iceMakerMeta)!;
  assert.equal(kitBuildTotal(kit, { "Ice Maker": 100, "Storage Bin": 201 }, { 100: 5716.74 }), null);
  // An UNCHOSEN unpriced part does not matter.
  assert.equal(kitBuildTotal(kit, { "Ice Maker": 100 }, { 100: 5716.74 }), 5716.74);
  assert.equal(kitBuildTotal(kit, { "Ice Maker": 100 }, { 100: 0 }), null);
});

test("the product is priced WITH the build: price, sale price and every variant carry it, and nothing is mutated", () => {
  const product = {
    price: "0.0000",
    salePrice: null as string | null,
    variants: [{ price: "10.00", salePrice: "9.00" }, { price: null, salePrice: null }],
  };
  const snapshot = JSON.stringify(product);
  const priced = withKitPrice(product, 7700.99);
  assert.equal(priced.price, "7700.99");
  assert.equal(priced.salePrice, null);
  assert.deepEqual(priced.variants, [{ price: "7710.99", salePrice: "7709.99" }, { price: null, salePrice: null }]);
  assert.equal(JSON.stringify(product), snapshot);
  // A base price the author set on the bundle stays in the figure (Tim's 11550 shape).
  assert.equal(withKitPrice({ price: "5716.74", salePrice: "5500.00" }, 1313.14).salePrice, "6813.14");
  // Nothing to add: the very same object.
  assert.equal(withKitPrice(product, 0), product);
  assert.equal(withKitPrice(product, null), product);
});

test("the member / contract price carries the build too, and no member price stays none", () => {
  assert.equal(memberPriceWithKit(5000, 1313.14), 6313.14);
  assert.equal(memberPriceWithKit(null, 1313.14), null);
  assert.deepEqual(memberPriceMapWithKit({ 7: 10, 8: 20 }, 5), { 7: 15, 8: 25 });
  const map = { 7: 10 };
  assert.equal(memberPriceMapWithKit(map, null), map);
});

// ── Tc5ekvD6 revision: a bundle written as its lines, and its listing price ──────────────────────

const hoshizaki = readProductKit({
  product_kind: "bundle",
  kit: {
    items: [
      { product_id: 203198, sku: "HOS-91000025", name: "B-301-SA", quantity: 1, group: "Storage Group" },
      { product_id: 203197, sku: "HOS-91000026", name: "B-501-SA", quantity: 1, group: "Storage Group" },
      { product_id: 203161, sku: "HOS-96000007", name: "TOP KIT 8D", quantity: 1, group: "Accessories" },
      { product_id: 203156, sku: "HOS-96000008", name: "TOP KIT 4DM", quantity: 1, group: "Accessories" },
    ],
  },
})!;

test("a build becomes one line per part, at the kit quantity times the bundles asked for", () => {
  const build = resolveKitChoices(hoshizaki, [
    { group: "Storage Group", product_id: 203198 },
    { group: "Accessories", product_id: 203161 },
  ])!;
  assert.deepEqual(bundleParts(build, 2), [
    { productId: 203198, sku: "HOS-91000025", name: "B-301-SA", quantity: 2, groups: ["Storage Group"] },
    { productId: 203161, sku: "HOS-96000007", name: "TOP KIT 8D", quantity: 2, groups: ["Accessories"] },
  ]);
  // A nonsense quantity is one bundle, never zero parts.
  assert.equal(bundleParts(build, 0)[0].quantity, 1);
});

test("two groups that picked the same product are ONE line of the summed quantity", () => {
  const kit = readProductKit({
    product_kind: "bundle",
    kit: {
      items: [
        { product_id: 5, name: "Shelf", quantity: 2, group: "Left" },
        { product_id: 6, name: "Door", quantity: 1, group: "Left" },
        { product_id: 5, name: "Shelf", quantity: 3, group: "Right" },
      ],
    },
  })!;
  const build = resolveKitChoices(kit, [
    { group: "Left", product_id: 5 },
    { group: "Right", product_id: 5 },
  ])!;
  assert.deepEqual(bundleParts(build, 1), [
    { productId: 5, sku: null, name: "Shelf", quantity: 5, groups: ["Left", "Right"] },
  ]);
});

test("a part's quote Comment names the bundle it was chosen for", () => {
  assert.equal(bundlePartNote("Hoshizaki KMD-270AB  Ice Maker - BUNDLE"), "Part of Hoshizaki KMD-270AB Ice Maker - BUNDLE");
  assert.equal(bundlePartNote("  "), "Part of a bundle");
});

test("a listing prices a bundle at the build its page opens on — default else first, per required group", () => {
  const prices = { 203198: 1313.14, 203197: 1665.56, 203161: 159.35, 203156: 144.14 };
  // Both groups required, no defaults: first bin + first top kit — exactly the page's first paint.
  assert.equal(defaultBuildTotal(hoshizaki, prices), 1472.49);
  // A part of that opening build with no price online: no total, so the tile keeps the bundle's own.
  assert.equal(defaultBuildTotal(hoshizaki, { ...prices, 203161: undefined as unknown as number }), null);
  // Not a bundle: nothing to add.
  assert.equal(defaultBuildTotal(null, prices), null);
  assert.equal(defaultBuildTotal(readProductKit(groupedMeta), prices), null);
});

test("a refused tile add sends the shopper to the bundle's own page — and never off the site", () => {
  assert.equal(bundleProductPath("hoshizaki-kmd-270ab-crescent-ice-maker-255kgday"), "/products/hoshizaki-kmd-270ab-crescent-ice-maker-255kgday");
  assert.equal(bundleProductPath("/products/x-bundle"), "/products/x-bundle");
  assert.equal(bundleProductPath("//evil.com"), "/products/evil.com");
  assert.equal(bundleProductPath("https://evil.com/x"), null);
  assert.equal(bundleProductPath("a\\b"), null);
  assert.equal(bundleProductPath(""), null);
  assert.equal(bundleProductPath(null), null);
});

// ── Review 2026-09-25: a part the page would not price is never offered, and never quoted ────────
// `prices` is `priceKitComponents`' answer: a part retired (is_visible false), soft-deleted, or not
// assigned to THIS storefront is simply absent from it, exactly like a hidden-price or $0 part.

test("the picker leaves out a part that cannot be bought here, and the build opens on the next choice", () => {
  const kit = readProductKit(bundleMeta)!;
  // 12 (Left bay's DEFAULT) is retired / sold only on the other storefront.
  const prices = { 11: 400, 21: 500, 22: 550 };
  const offered = offeredKit(kit, prices)!;
  assert.deepEqual(offered.groups.map((g) => [g.name, g.items.map((i) => i.productId)]), [
    ["Left bay", [11]],
    ["Right bay", [21, 22]],
  ]);
  assert.deepEqual(defaultKitSelection(offered.groups), { "Left bay": 11, "Right bay": 21 });
  assert.equal(defaultBuildTotal(offered, prices), 900);
  // Without the filter that same bundle opened on no price at all.
  assert.equal(defaultBuildTotal(kit, prices), null);
  // The server still resolves against the full kit: every offered build is a valid one.
  assert.ok(resolveKitChoices(kit, toKitChoices(defaultKitSelection(offered.groups))));
  // Never mutates the product's own kit.
  assert.equal(kit.groups[0].items.length, 2);
});

test("a required group with no buyable choice is kept as authored; an optional one is dropped", () => {
  const kit = readProductKit(iceMakerMeta)!;
  // The ice maker (required, fixed) and both bins (optional) cannot be bought here.
  const offered = offeredKit(kit, { 301: 159.35 })!;
  assert.deepEqual(offered.groups.map((g) => g.name), ["Ice Maker", "Accessories"]);
  assert.equal(offered.groups[0].items.length, 1);
  // So the page still says the build is priced by our team, rather than dropping the question.
  assert.equal(defaultBuildTotal(offered, { 301: 159.35 }), null);
});

test("the picker offers everything when every part is buyable, and a hidden-price bundle is untouched", () => {
  const kit = readProductKit(iceMakerMeta)!;
  const all = { 100: 5716.74, 201: 1313.14, 202: 1665.56, 301: 159.35 };
  assert.equal(offeredKit(kit, all), kit);
  assert.equal(offeredKit(kit, {}, true), kit);
  assert.equal(offeredKit(null, all), null);
  const grouped = readProductKit(groupedMeta)!;
  assert.equal(offeredKit(grouped, {}), grouped);
});

test("Add to Quote names the part that is not on this storefront, or is deleted, and passes a buildable one", () => {
  const parts = [
    { productId: 100, name: "KMD-270AB ice maker" },
    { productId: 201, name: "Bin 301" }, // assigned to the other storefront only
    { productId: 301, name: "Top kit 8D" }, // soft-deleted since the page was drawn
  ];
  assert.equal(unbuyableBundlePart(parts, { 100: 5716.74, 301: 159.35 })?.name, "Bin 301");
  assert.equal(unbuyableBundlePart(parts, { 100: 5716.74, 201: 1313.14 })?.name, "Top kit 8D");
  assert.equal(unbuyableBundlePart(parts, { 100: 5716.74, 201: 1313.14, 301: 0 })?.name, "Top kit 8D");
  assert.equal(unbuyableBundlePart(parts, { 100: 5716.74, 201: 1313.14, 301: 159.35 }), null);
  assert.equal(unbuyableBundlePart([], {}), null);
});
