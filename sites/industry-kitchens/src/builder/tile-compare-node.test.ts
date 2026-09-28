import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import {
  PRODUCT_CARD_KEY,
  TILE_COMPARE_KEY,
  withTileCompareInComponents,
  withTileCompareNode,
} from "./tile-compare-node.ts";

// IK's live `product-card` master: an <a> root bound to `props.card`.
function card(): NodeTree {
  return {
    v: 1,
    root: {
      id: "card-a",
      kind: "element",
      tag: "a",
      classes: ["group", "block"],
      attrs: { href: { kind: "binding", path: "props.card.href" } },
      children: [{ id: "name", kind: "element", tag: "h3", text: [{ kind: "binding", path: "props.card.name" }] }],
    },
  } as unknown as NodeTree;
}

const kids = (n: BuilderNode) => (n.kind === "element" ? (n.children ?? []) : []);

test("wraps the card and puts the compare control after it, OUTSIDE the link, bound to the row", () => {
  const tree = card();
  const out = withTileCompareNode(tree);
  assert.equal(out.root.kind === "element" && out.root.tag, "div");
  const [first, second] = kids(out.root);
  assert.equal(first, tree.root, "the card itself is untouched");
  assert.equal(second.kind === "component" && second.componentKey, TILE_COMPARE_KEY);
  assert.deepEqual((second as { props?: unknown }).props, {
    productId: { kind: "binding", path: "props.card.id" },
  });
  // Never mutates the stored master.
  assert.equal(tree.root.kind === "element" && tree.root.tag, "a");
});

test("idempotent, and an author's own placement is kept", () => {
  const once = withTileCompareNode(card());
  assert.equal(withTileCompareNode(once), once);
});

test("the library: only product-card changes; no card, same map", () => {
  const other = card();
  const lib = { [PRODUCT_CARD_KEY]: card(), "price-block": other };
  const out = withTileCompareInComponents(lib);
  assert.notEqual(out, lib);
  assert.equal(out["price-block"], other);
  assert.equal(withTileCompareInComponents(out), out);
  const empty = { "price-block": other };
  assert.equal(withTileCompareInComponents(empty), empty);
});
