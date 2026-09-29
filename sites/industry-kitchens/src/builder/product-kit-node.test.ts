import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { PRODUCT_KIT_NODE_ID, withProductKitNode } from "./product-kit-node.ts";
import { PACK_NOTE_NODE_ID, withPackNoteNode } from "./product-pack-note.ts";
import { PRODUCT_INSTRUCTIONS_NODE_ID, withProductInstructionsNode } from "./product-instructions-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({ id, kind: "element", tag: "div", children });
const comp = (id: string, componentKey: string): BuilderNode => ({ id, kind: "component", componentKey });

const tree = (): NodeTree => ({
  v: 1,
  root: el("pdp-root", [
    el("overview", [
      comp("gallery", "product-gallery"),
      el("buy", [el("title"), comp("price-panel-inst", "price-panel"), el("bulk"), comp("actions-row-inst", "actions-row")]),
    ]),
  ]),
});

const ids = (node: BuilderNode): string[] => {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node.id, ...kids.flatMap(ids)];
};
const buyRow = (t: NodeTree): string[] => {
  const overview = (t.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  return (overview.children[1] as { children: BuilderNode[] }).children.map((c) => c.id);
};

test("the kit contents land immediately above the buy buttons", () => {
  assert.deepEqual(buyRow(withProductKitNode(tree())), [
    "title",
    "price-panel-inst",
    "bulk",
    PRODUCT_KIT_NODE_ID,
    "actions-row-inst",
  ]);
});

test("the placed node is the sealed `product-kit` native", () => {
  const out = withProductKitNode(tree());
  const overview = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  const node = (overview.children[1] as { children: BuilderNode[] }).children[3];
  assert.deepEqual(node, { id: "product-kit", kind: "component", componentKey: "product-kit" });
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withProductKitNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});

test("an author's own placement wins — by id or by component key", () => {
  for (const authoredNode of [comp(PRODUCT_KIT_NODE_ID, PRODUCT_KIT_NODE_ID), comp("my-kit", "product-kit")]) {
    const authored = tree();
    const overview = (authored.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
    (overview.children[1] as { children: BuilderNode[] }).children.unshift(authoredNode);
    assert.equal(withProductKitNode(authored), authored);
  }
});

test("idempotent — running twice places it once", () => {
  const twice = withProductKitNode(withProductKitNode(tree()));
  assert.equal(ids(twice.root).filter((id) => id === PRODUCT_KIT_NODE_ID).length, 1);
});

test("never inserts into a related-products repeat, whose tiles carry their own buy row", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        children: [el("tile", [comp("tile-actions", "actions-row")])],
      } as unknown as BuilderNode,
      el("buy", [comp("price-panel-inst", "price-panel")]),
    ]),
  };
  const out = withProductKitNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(buy.children.map((c) => c.id), ["price-panel-inst", PRODUCT_KIT_NODE_ID]);
});

test("with no anchors at all it goes at the end of the root rather than vanishing", () => {
  const out = withProductKitNode({ v: 1, root: el("pdp-root", [el("x")]) });
  assert.deepEqual((out.root as { children: BuilderNode[] }).children.map((c) => c.id), ["x", PRODUCT_KIT_NODE_ID]);
});

test("in the branch's order: price -> pack note -> kit -> instructions -> buy row", () => {
  const out = withProductInstructionsNode(withProductKitNode(withPackNoteNode(tree())));
  const row = buyRow(out);
  const at = (id: string) => row.indexOf(id);
  assert.ok(at(PACK_NOTE_NODE_ID) >= 0 && at(PRODUCT_INSTRUCTIONS_NODE_ID) >= 0);
  assert.ok(at(PACK_NOTE_NODE_ID) < at(PRODUCT_KIT_NODE_ID));
  assert.ok(at(PRODUCT_KIT_NODE_ID) < at(PRODUCT_INSTRUCTIONS_NODE_ID));
  assert.ok(at(PRODUCT_INSTRUCTIONS_NODE_ID) < at("actions-row-inst"));
});

test("the product node branch applies the kit placer, right after the pack note", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const branch = readFileSync(join(here, "product-node-branch.tsx"), "utf8");
  assert.match(branch, /composeProductPlacements\(/);
  const placements = readFileSync(join(here, "product-placements.ts"), "utf8");
  assert.match(placements, /\["pack-note", withPackNoteNode\],\s*\["kit", withProductKitNode\]/);
});
