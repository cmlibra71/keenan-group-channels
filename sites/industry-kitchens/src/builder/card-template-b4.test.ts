import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { withTileCompareNode, TILE_COMPARE_PLACEMENT } from "./tile-compare-node.ts";
import { withPromoTag, PROMO_TAG_PLACEMENT } from "./promo-tag-node.ts";
import { applyBrandLogoFallback, BRAND_LOGO_PLACEMENT, INDUSTRY_KITCHENS_TARGETS } from "./product-card-brand-logo.ts";
import { readProductKit, kitConfiguredPrice, defaultKitSelection, toggleKitSelection } from "../lib/product-kit.ts";

// IK card batch (2026-09-29): the product-card master authors what these passes used to place, and
// declares it; the kit carries Zoey's bundle prices.

const card = (owns: string | null): NodeTree =>
  ({
    v: 1,
    root: {
      id: "ikc-card",
      kind: "element",
      tag: "div",
      ...(owns ? { attrs: { "data-kg-template-owns": { kind: "static", value: owns } } } : {}),
      children: [
        {
          id: "stage",
          kind: "element",
          tag: "div",
          children: [
            { id: "photo", kind: "element", tag: "img", condition: { kind: "expr", source: "props.card.image_url" } },
            { id: "grey", kind: "element", tag: "div", condition: { kind: "expr", source: "!props.card.image_url" } },
          ],
        },
        { id: "price", kind: "component", componentKey: "price-block", label: "price-wrap" },
      ],
    },
  }) as unknown as NodeTree;

describe("declared placements are left as authored", () => {
  it("tile-compare", () => {
    assert.notEqual(withTileCompareNode(card(null)), card(null));
    const t = card(TILE_COMPARE_PLACEMENT);
    assert.equal(withTileCompareNode(t), t);
  });
  it("promo-tag", () => {
    assert.ok(JSON.stringify(withPromoTag(card(null), "Buy more")).includes("promo-tag"));
    const t = card(PROMO_TAG_PLACEMENT);
    assert.equal(withPromoTag(t, "Buy more"), t);
  });
  it("brand-logo", () => {
    const target = INDUSTRY_KITCHENS_TARGETS[0];
    assert.equal(applyBrandLogoFallback(card(null), target).inserted, true);
    const t = card(BRAND_LOGO_PLACEMENT);
    const r = applyBrandLogoFallback(t, target);
    assert.equal(r.inserted, false);
    assert.equal(r.tree, t);
  });
});

describe("the kit carries Zoey's bundle prices (this storefront only)", () => {
  const metafields = {
    kit: { items: [{ product_id: 9, name: "Shared", group: "G" }] },
    channel_kits: {
      "1": {
        product_kind: "bundle",
        quote_only: true,
        zoey_price: { display: "range", from: 741.2, to: 2063.8, price: null },
        kit: {
          items: [
            { product_id: 1, name: "Power unit", group: "Power", zoey_selection_price: 741.2 },
            { product_id: 2, name: "Tenderizer", group: "Tenderizer", zoey_selection_price: 731 },
            { product_id: 3, name: "Stripper", group: "Stripper", zoey_selection_price: 591.6 },
          ],
          groups: [
            { name: "Power", mode: "included" },
            { name: "Tenderizer", mode: "one", required: false },
            { name: "Stripper", mode: "one", required: false },
          ],
        },
      },
    },
  };
  it("reads the captured box and the option prices from the scoped kit; the shared kit has none", () => {
    const kit = readProductKit(metafields, 1)!;
    assert.equal(kit.zoeyPrice?.to, 2063.8);
    assert.deepEqual(kit.items.map((i) => i.selectionPrice), [741.2, 731, 591.6]);
    const shared = readProductKit(metafields, 2)!;
    assert.equal(shared.zoeyPrice, null);
    assert.equal(shared.items[0].selectionPrice, null);
  });
  it("Price as configured: From, plus each picked optional row (the included head unit is inside From)", () => {
    const kit = readProductKit(metafields, 1)!;
    let sel = defaultKitSelection(kit.groups);
    assert.equal(kitConfiguredPrice(kit, sel), 741.2);
    sel = toggleKitSelection(kit, sel, "Tenderizer", 2);
    assert.equal(kitConfiguredPrice(kit, sel), 1472.2);
    sel = toggleKitSelection(kit, sel, "Stripper", 3);
    assert.equal(kitConfiguredPrice(kit, sel), 2063.8);
    assert.equal(kitConfiguredPrice(readProductKit(metafields, 2), {}), null);
  });
});
