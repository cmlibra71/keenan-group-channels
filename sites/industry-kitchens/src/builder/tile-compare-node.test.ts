import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import {
  PRODUCT_CARD_KEY,
  TILE_COMPARE_KEY,
  TILE_COMPARE_CONDITION,
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
  // Hidden only where the page's own list hides compare (Zoey `hide-compare`).
  assert.deepEqual((second as { condition?: unknown }).condition, {
    kind: "expr",
    source: TILE_COMPARE_CONDITION,
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

test("the compare condition shows the link only where the page's Zoey list showed it (and on product rails)", async () => {
  const { parseExpr, evalExpr } = await import("@keenan/services/builder");
  const parsed = parseExpr(TILE_COMPARE_CONDITION);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const shows = (compare: unknown, kind = "category") =>
    !!evalExpr(parsed.ast, (p) => (p === "context.listing.compare" ? compare : p === "context.kind" ? kind : undefined));
  assert.equal(shows(undefined), false, "an unharvested listing takes Zoey's majority: hidden");
  assert.equal(shows(null), false, "setting not stored for this page");
  assert.equal(shows(true), true, "Zoey showed compare on this list");
  assert.equal(shows(false), false, "Zoey hid compare on this list");
  assert.equal(shows(undefined, "product"), true, "the product page's rails carry it");
  assert.equal(shows(undefined, "home"), false, "the home rails never did");
});
