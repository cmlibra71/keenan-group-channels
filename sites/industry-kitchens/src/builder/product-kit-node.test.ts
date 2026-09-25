import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { PRODUCT_KIT_NODE_ID, withProductKitNode } from "./product-kit-node.ts";
import { PRODUCT_ADDONS_NODE_ID, withAddonsNode } from "./product-addons-node.ts";
import { PRODUCT_INSTRUCTIONS_NODE_ID, withProductInstructionsNode } from "./product-instructions-node.ts";
import { PACK_NOTE_NODE_ID, withPackNoteNode } from "./product-pack-note.ts";
import { COMBINATION_NOTICE_NODE_ID, withCombinationNoticeNode } from "./product-combination-notice.ts";
import { SILVERCHEF_NODE_ID, withSilverChefNode } from "./silverchef-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  children,
});
const comp = (id: string, componentKey: string): BuilderNode => ({ id, kind: "component", componentKey });

/** The shape both live product trees share: the buy column holds the price panel, then the bulk
 *  table, then the buy buttons. */
const tree = (): NodeTree => ({
  v: 1,
  root: el("pdp-root", [
    el("overview", [
      comp("gallery", "product-gallery"),
      el("buy", [
        el("title"),
        comp("price-panel-inst", "price-panel"),
        el("bulk"),
        comp("actions-row-inst", "actions-row"),
      ]),
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
  const buy = overview.children[1] as { children: BuilderNode[] };
  return buy.children.map((c) => c.id);
};

test("the kit block lands immediately above the buy buttons — the bundle is built before it is bought", () => {
  assert.deepEqual(buyRow(withProductKitNode(tree())), [
    "title",
    "price-panel-inst",
    "bulk",
    PRODUCT_KIT_NODE_ID,
    "actions-row-inst",
  ]);
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withProductKitNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});

test("an author's own placement wins, whatever node id they gave it", () => {
  const authored = tree();
  const overview = (authored.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  (overview.children[1] as { children: BuilderNode[] }).children.unshift(comp("authored-kit-7", "product-kit"));
  const out = withProductKitNode(authored);
  assert.equal(out, authored, "the same tree object comes back");
  assert.equal(ids(out.root).includes(PRODUCT_KIT_NODE_ID), false);
});

test("never inside a repeat: the related rail's own buy row is not an anchor", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        source: "related",
        children: [el("card", [comp("card-actions", "actions-row")])],
      },
      el("buy", [comp("price-panel-inst", "price-panel"), comp("actions-row-inst", "actions-row")]),
    ]),
  };
  const out = withProductKitNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(buy.children.map((c) => c.id), ["price-panel-inst", PRODUCT_KIT_NODE_ID, "actions-row-inst"]);
  assert.equal(ids(out.root).filter((id) => id === PRODUCT_KIT_NODE_ID).length, 1);
});

test("with the ONLY buy row inside a repeat, the block falls back to after the price panel", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      { id: "related", kind: "repeat", source: "related", children: [comp("card-actions", "actions-row")] },
      el("buy", [el("title"), comp("price-panel-inst", "price-panel")]),
    ]),
  };
  const buy = (withProductKitNode(t).root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(buy.children.map((c) => c.id), ["title", "price-panel-inst", PRODUCT_KIT_NODE_ID]);
});

test("a tree with no anchor at all still gets the block", () => {
  const out = withProductKitNode({ v: 1, root: el("pdp-root", [el("prose")]) });
  assert.ok(ids(out.root).includes(PRODUCT_KIT_NODE_ID));
});

// The branch composes six placers on the same buy column (`product-node-branch.tsx`). This pins
// the order the register records: price -> weekly rent -> pack sentence -> BUILD -> Instructions ->
// extras -> "we do not make that combination" -> buy row. No placer may displace another.
test("composed exactly as the branch composes it, every placer keeps its place", () => {
  const composed = withCombinationNoticeNode(
    withAddonsNode(withProductInstructionsNode(withProductKitNode(withPackNoteNode(withSilverChefNode(tree())))))
  );
  const row = buyRow(composed);
  const at = (id: string) => row.indexOf(id);
  for (const id of [SILVERCHEF_NODE_ID, PACK_NOTE_NODE_ID, PRODUCT_KIT_NODE_ID, PRODUCT_INSTRUCTIONS_NODE_ID, PRODUCT_ADDONS_NODE_ID, COMBINATION_NOTICE_NODE_ID]) {
    assert.ok(at(id) >= 0, `${id} placed`);
  }
  assert.ok(at("price-panel-inst") < at(SILVERCHEF_NODE_ID));
  assert.ok(at(PACK_NOTE_NODE_ID) < at(PRODUCT_KIT_NODE_ID), "pack sentence above the build");
  assert.ok(at(PRODUCT_KIT_NODE_ID) < at(PRODUCT_INSTRUCTIONS_NODE_ID), "build above the Instructions box");
  assert.ok(at(PRODUCT_INSTRUCTIONS_NODE_ID) < at(PRODUCT_ADDONS_NODE_ID));
  assert.ok(at(PRODUCT_ADDONS_NODE_ID) < at(COMBINATION_NOTICE_NODE_ID));
  assert.equal(row[row.length - 1], "actions-row-inst");
  assert.equal(row[row.length - 2], COMBINATION_NOTICE_NODE_ID, "the dead-button sentence stays last");
});
