import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { PRODUCT_ADDONS_NODE_ID, withAddonsNode } from "./product-addons-node.ts";
import { SILVERCHEF_NODE_ID, withSilverChefNode } from "./silverchef-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  children,
});
const comp = (id: string, componentKey: string): BuilderNode => ({ id, kind: "component", componentKey });

/** The shape both live product trees share: a buy column holding the price
 *  panel, then the bulk table, then the buy buttons. */
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

/** Every id in the tree, repeat subtrees INCLUDED — so "the panel appears
 *  exactly once" is a claim about the whole tree, not only the part the
 *  inserter is allowed to walk. */
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

test("the extras land immediately ABOVE the buy buttons — a shopper meets them before Add to Cart", () => {
  const out = withAddonsNode(tree());
  assert.deepEqual(buyRow(out), [
    "title",
    "price-panel-inst",
    "bulk",
    PRODUCT_ADDONS_NODE_ID,
    "actions-row-inst",
  ]);
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withAddonsNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});

test("an author's own placement wins and nothing is added", () => {
  const authored = tree();
  const overview = (authored.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  (overview.children[1] as { children: BuilderNode[] }).children.unshift(
    comp(PRODUCT_ADDONS_NODE_ID, PRODUCT_ADDONS_NODE_ID)
  );
  const out = withAddonsNode(authored);
  assert.equal(out, authored, "the same tree object comes back");
  assert.equal(ids(out.root).filter((id) => id === PRODUCT_ADDONS_NODE_ID).length, 1);
});

test("with no buy row it falls back to just after the price panel", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [el("buy", [el("title"), comp("price-panel-inst", "price-panel")])]),
  };
  const out = withAddonsNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["title", "price-panel-inst", PRODUCT_ADDONS_NODE_ID]
  );
});

test("a tree with neither anchor still gets the panel", () => {
  const t: NodeTree = { v: 1, root: el("pdp-root", [el("prose")]) };
  const out = withAddonsNode(t);
  assert.ok(ids(out.root).includes(PRODUCT_ADDONS_NODE_ID));
});

test("the panel is never dropped inside a repeat, and never once per related card", () => {
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
  const out = withAddonsNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["price-panel-inst", PRODUCT_ADDONS_NODE_ID, "actions-row-inst"]
  );
  assert.equal(ids(out.root).filter((id) => id === PRODUCT_ADDONS_NODE_ID).length, 1);
});

test("with the ONLY actions row inside a repeat, the price-panel fallback fires", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        source: "related",
        children: [el("card", [comp("card-actions", "actions-row")])],
      },
      el("buy", [el("title"), comp("price-panel-inst", "price-panel")]),
    ]),
  };
  const out = withAddonsNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["title", "price-panel-inst", PRODUCT_ADDONS_NODE_ID]
  );
});

// The two render-time passes share the buy column, and the branch runs both on
// every product page. Neither may displace the other: the live order is
// price -> weekly rent -> extras -> buy, whichever way round they are applied.
test("extras and the SilverChef panel coexist in the buy column, in that order", () => {
  const both = withAddonsNode(withSilverChefNode(tree()));
  assert.deepEqual(buyRow(both), [
    "title",
    "price-panel-inst",
    SILVERCHEF_NODE_ID,
    "bulk",
    PRODUCT_ADDONS_NODE_ID,
    "actions-row-inst",
  ]);
  // And the other way round, in case the call site is ever reordered.
  const reversed = withSilverChefNode(withAddonsNode(tree()));
  assert.deepEqual(buyRow(reversed), [
    "title",
    "price-panel-inst",
    SILVERCHEF_NODE_ID,
    "bulk",
    PRODUCT_ADDONS_NODE_ID,
    "actions-row-inst",
  ]);
});

test("with no actions row, extras land after the SilverChef panel rather than above it", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [el("buy", [comp("price-panel-inst", "price-panel")])]),
  };
  const out = withAddonsNode(withSilverChefNode(t));
  const buy = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["price-panel-inst", SILVERCHEF_NODE_ID, PRODUCT_ADDONS_NODE_ID]
  );
});
