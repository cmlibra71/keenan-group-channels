import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import {
  WISHLIST_ADD_MASTER,
  WISHLIST_BUTTON_NATIVE,
  WISHLIST_TILE_MASTER,
  WISHLIST_TILE_NATIVE,
  withWishlistNode,
  withWishlistTileInComponents,
  withWishlistTileNode,
} from "./wishlist-node.ts";

function productTree(withCompare: boolean): NodeTree {
  return {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "details",
          kind: "element",
          tag: "div",
          children: [
            { id: "n-price", kind: "component", componentKey: "price-panel" },
            { id: "n-buy", kind: "component", componentKey: "actions-row" },
            ...(withCompare ? [{ id: "product-compare", kind: "component", componentKey: "product-compare" }] : []),
            { id: "ikp-clearance", kind: "element", tag: "div", children: [] },
          ],
        },
        {
          id: "related",
          kind: "repeat",
          source: "related",
          children: [{ id: "tile-buy", kind: "component", componentKey: "actions-row" }],
        } as unknown as BuilderNode,
      ],
    },
  } as NodeTree;
}

const kids = (n: BuilderNode) => (n.kind === "element" ? (n.children ?? []) : []);

test("switched off (Chefs Depot, or any channel without wishlist_enabled): the very same tree", () => {
  const tree = productTree(true);
  assert.equal(withWishlistNode(tree, { enabled: false }), tree);
});

test("the master reference goes directly after the compare control, never inside a repeat", () => {
  const tree = productTree(true);
  const out = withWishlistNode(tree, { enabled: true });
  assert.deepEqual(kids(kids(out.root)[0]).map((n) => n.id), ["n-price", "n-buy", "product-compare", WISHLIST_ADD_MASTER, "ikp-clearance"]);
  const placed = kids(kids(out.root)[0])[3];
  assert.equal(placed.kind === "component" && placed.componentKey, WISHLIST_ADD_MASTER, "a MASTER reference — the words live in the CMS");
  assert.equal((placed as { props?: unknown }).props, undefined, "no words or props are supplied by code");
  // The repeat (related tiles) is untouched.
  assert.equal(kids(out.root)[1], kids(tree.root)[1]);
  // Pure: the stored tree is not mutated.
  assert.deepEqual(kids(kids(tree.root)[0]).map((n) => n.id), ["n-price", "n-buy", "product-compare", "ikp-clearance"]);
});

test("no compare control: after the buy row; neither: at the end of the root", () => {
  const out = withWishlistNode(productTree(false), { enabled: true });
  assert.deepEqual(kids(kids(out.root)[0]).map((n) => n.id), ["n-price", "n-buy", WISHLIST_ADD_MASTER, "ikp-clearance"]);
  const bare = { v: 1, root: { id: "r", kind: "element", tag: "div", children: [] } } as unknown as NodeTree;
  assert.deepEqual(kids(withWishlistNode(bare, { enabled: true }).root).map((n) => n.id), [WISHLIST_ADD_MASTER]);
});

test("author first: placed in the tree, inside a master, or declared owned — nothing is added", () => {
  const authored = productTree(true);
  (kids(authored.root)[0] as { children: BuilderNode[] }).children.push({ id: "mine", kind: "component", componentKey: WISHLIST_BUTTON_NATIVE } as BuilderNode);
  assert.equal(withWishlistNode(authored, { enabled: true }), authored);

  const viaMaster = productTree(false);
  const components = {
    "actions-row": { v: 1, root: { id: "ar", kind: "element", tag: "div", children: [{ id: "w", kind: "component", componentKey: WISHLIST_ADD_MASTER }] } } as unknown as NodeTree,
  };
  assert.equal(withWishlistNode(viaMaster, { enabled: true, components }), viaMaster);

  const owned = productTree(true);
  (owned.root as { attrs?: unknown }).attrs = { "data-kg-template-owns": { kind: "static", value: "compare wishlist" } };
  assert.equal(withWishlistNode(owned, { enabled: true }), owned);
});

function card(): NodeTree {
  return { v: 1, root: { id: "card-link", kind: "element", tag: "a", children: [] } } as unknown as NodeTree;
}

test("tile: a link card is wrapped (never a control inside the <a>), the row handed in as props.card", () => {
  const c = card();
  const out = withWishlistTileNode(c);
  assert.equal(out.root.kind, "element");
  assert.equal((out.root as { tag?: string }).tag, "div");
  const [first, ref] = kids(out.root);
  assert.equal(first, c.root, "the card itself is untouched, outside the control");
  assert.equal(ref.kind === "component" && ref.componentKey, WISHLIST_TILE_MASTER);
  assert.deepEqual((ref as { props?: unknown }).props, { card: { kind: "binding", path: "props.card" } });
});

test("tile: a box card takes the reference as its LAST child (inside the card, not hanging below it)", () => {
  const box = {
    v: 1,
    root: { id: "card-box", kind: "element", tag: "div", children: [{ id: "link", kind: "element", tag: "a", children: [] }, { id: "actions", kind: "element", tag: "div", children: [] }] },
  } as unknown as NodeTree;
  const out = withWishlistTileNode(box);
  assert.equal(out.root.id, "card-box");
  assert.deepEqual(kids(out.root).map((n) => n.id), ["link", "actions", `${WISHLIST_TILE_MASTER}-node`]);
  assert.deepEqual(kids(box.root).map((n) => n.id), ["link", "actions"], "the stored master is not mutated");
});

test("tile: Industry Kitchens' shape (compare wrapper around a full-height card) — inside the card; idempotent", () => {
  const ik = {
    v: 1,
    root: {
      id: "tile-compare-wrap",
      kind: "element",
      tag: "div",
      children: [
        { id: "ikc-card", kind: "element", tag: "div", classes: ["flex", "h-full", "flex-col"], children: [{ id: "card-link", kind: "element", tag: "a", children: [] }, { id: "ikc-tile-actions", kind: "element", tag: "div", children: [] }] },
        { id: "tile-compare-node", kind: "component", componentKey: "tile-compare" },
      ],
    },
  } as unknown as NodeTree;
  const out = withWishlistTileNode(ik);
  assert.deepEqual(kids(out.root).map((n) => n.id), ["ikc-card", "tile-compare-node"], "the wrapper keeps its two children");
  assert.deepEqual(kids(kids(out.root)[0]).map((n) => n.id), ["card-link", "ikc-tile-actions", `${WISHLIST_TILE_MASTER}-node`]);
  assert.equal(kids(out.root)[1], kids(ik.root)[1]);
  assert.equal(withWishlistTileNode(out), out, "a second pass adds nothing");
  // A wrapper whose card is a link: the reference joins the wrapper instead.
  const linkCard = { v: 1, root: { id: "tile-compare-wrap", kind: "element", tag: "div", children: [card().root, { id: "tile-compare-node", kind: "component", componentKey: "tile-compare" }] } } as unknown as NodeTree;
  assert.deepEqual(kids(withWishlistTileNode(linkCard).root).map((n) => n.id), ["card-link", "tile-compare-node", `${WISHLIST_TILE_MASTER}-node`]);
  const native = { v: 1, root: { id: "x", kind: "element", tag: "div", children: [{ id: "n", kind: "component", componentKey: WISHLIST_TILE_NATIVE }] } } as unknown as NodeTree;
  assert.equal(withWishlistTileNode(native), native);
  const owned = { v: 1, root: { id: "y", kind: "element", tag: "div", attrs: { "data-kg-template-owns": { kind: "static", value: "wishlist" } }, children: [] } } as unknown as NodeTree;
  assert.equal(withWishlistTileNode(owned), owned);
});

test("tile library: off or no product-card = the same map", () => {
  const lib = { "product-card": card() };
  assert.equal(withWishlistTileInComponents(lib, false), lib);
  const none = { "category-tile": card() };
  assert.equal(withWishlistTileInComponents(none, true), none);
  const on = withWishlistTileInComponents(lib, true);
  assert.notEqual(on, lib);
  assert.equal(lib["product-card"].root.id, "card-link", "the cached library is not mutated");
});
