import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";

import {
  withTilePackLine,
  withTilePackLineInComponents,
  PRODUCT_CARD_KEY,
  TILE_PACK_LINE_NODE_ID,
} from "./tile-pack-line";
import { withPromoTag } from "./promo-tag-node";

/**
 * The LIVE Chefs Depot `product-card` master's body (channel 2, read read-only from production on
 * 2026-09-25), trimmed to the layers that matter: price-wrap, then the ctas buy row.
 */
function cdTile(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-cseed-32",
      kind: "element",
      tag: "div",
      label: "product-card",
      children: [
        {
          id: "div-cseed-31",
          kind: "element",
          tag: "div",
          label: "card-body",
          children: [
            { id: "div-cseed-20", kind: "element", tag: "div", label: "price-wrap", children: [] },
            {
              id: "div-cseed-30",
              kind: "element",
              tag: "div",
              label: "ctas",
              children: [
                { id: "cmp-cseed-21", kind: "component", componentKey: "add-to-cart" },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** Industry Kitchens' live tile has no buy row at all (read 2026-09-25). */
function ikTile(): NodeTree {
  return {
    v: 1,
    root: {
      id: "ik-root",
      kind: "element",
      tag: "div",
      label: "product-card",
      children: [
        {
          id: "ik-body",
          kind: "element",
          tag: "div",
          label: "card-body",
          children: [{ id: "ik-price", kind: "component", label: "price", componentKey: "price-block" }],
        },
      ],
    },
  } as unknown as NodeTree;
}

function childLabels(tree: NodeTree): string[] {
  const body = (tree.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  return body.children.map((c) => String(c.label ?? c.id));
}

test("the pack line goes directly before the buy row it explains", () => {
  const out = withTilePackLine(cdTile());
  assert.deepEqual(childLabels(out), ["price-wrap", "pack-line", "ctas"]);
});

test("the node is bound to the row's pack_line and renders only where it is non-empty", () => {
  const out = withTilePackLine(cdTile());
  const body = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  const node = body.children.find((c) => c.id === TILE_PACK_LINE_NODE_ID) as unknown as {
    text: { kind: string; path: string }[];
    condition: { kind: string; source: string };
  };
  assert.deepEqual(node.text, [{ kind: "binding", path: "props.card.pack_line" }]);
  assert.deepEqual(node.condition, { kind: "expr", source: "props.card.pack_line" });
});

test("after the Buy more & save tag when that pass ran first, so the line sits on the button", () => {
  const out = withTilePackLine(withPromoTag(cdTile(), "Buy more & save"));
  assert.deepEqual(childLabels(out), ["price-wrap", "promo-tag", "pack-line", "ctas"]);
});

test("idempotent: a second pass returns the very same tree", () => {
  const once = withTilePackLine(cdTile());
  assert.equal(withTilePackLine(once), once);
});

test("a tile with no buy row gets nothing — there is no press for the line to describe", () => {
  const tree = ikTile();
  assert.equal(withTilePackLine(tree), tree);
});

test("the stored tree is never mutated", () => {
  const tree = cdTile();
  const before = JSON.stringify(tree);
  withTilePackLine(tree);
  assert.equal(JSON.stringify(tree), before);
});

test("the component map changes only its tile master, and comes back untouched otherwise", () => {
  const other = { v: 1, root: { id: "x", kind: "element", tag: "div", children: [] } } as unknown as NodeTree;
  const map = { [PRODUCT_CARD_KEY]: cdTile(), "price-block": other };
  const out = withTilePackLineInComponents(map);
  assert.notEqual(out, map);
  assert.equal(out["price-block"], other);
  assert.ok(childLabels(out[PRODUCT_CARD_KEY]).includes("pack-line"));

  const ik = { [PRODUCT_CARD_KEY]: ikTile() };
  assert.equal(withTilePackLineInComponents(ik), ik);
  const none = { "price-block": other };
  assert.equal(withTilePackLineInComponents(none), none);
});
