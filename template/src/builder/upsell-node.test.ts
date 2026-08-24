import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { withUpsellBlock, UPSELL_HEADING } from "./upsell-node";

// ============================================================================
// Card fYqTM5Ot — the upsell rail.
//
// The two fixtures below are the SHAPES read off the live published product
// trees on 2026-08-24 (channel 2 = cms_pages 71 / version 155, channel 1 =
// page 69 / version 142), because that is what this pass actually runs over —
// the seed is only a fallback for a site that never authored one.
//
// Chefs Depot: root > related-wrap (condition kind "data") > related >
//              related-heading (h2) + related-grid > related-repeat >
//              product-card component.
// Industry Kitchens: root > wrapper (condition kind "expr") > h2 + grid >
//              repeat > product-card component. Different id vocabulary,
//              different condition dialect, no inner wrapper.
// ============================================================================

const cdTree = (): NodeTree => ({
  v: 1,
  root: {
    id: "pdp-root",
    kind: "element",
    tag: "div",
    children: [
      { id: "overview-wrap", kind: "element", tag: "div", children: [] },
      {
        id: "related-wrap",
        kind: "element",
        tag: "div",
        condition: { kind: "data", path: "related.products[0]" },
        classes: ["mx-auto", "max-w-7xl"],
        children: [
          {
            id: "related",
            kind: "element",
            tag: "div",
            children: [
              {
                id: "related-heading",
                kind: "element",
                tag: "h2",
                text: [{ kind: "static", value: "You may also like" }],
              },
              {
                id: "related-grid",
                kind: "element",
                tag: "div",
                children: [
                  {
                    id: "related-repeat",
                    kind: "repeat",
                    source: "related.products",
                    itemAlias: "card",
                    limit: 12,
                    children: [
                      { id: "rc-card-inst", kind: "component", componentKey: "product-card" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

const ikTree = (): NodeTree => ({
  v: 1,
  root: {
    id: "n-root",
    kind: "element",
    tag: "div",
    children: [
      { id: "n-overview", kind: "element", tag: "div", children: [] },
      {
        id: "n-related",
        kind: "element",
        tag: "div",
        condition: { kind: "expr", source: "related.products[0]" },
        children: [
          {
            id: "n-heading",
            kind: "element",
            tag: "h2",
            text: [{ kind: "static", value: "You may also like" }],
          },
          {
            id: "n-grid",
            kind: "element",
            tag: "div",
            children: [
              {
                id: "n-repeat",
                kind: "repeat",
                source: "related.products",
                children: [{ id: "n-card", kind: "component", componentKey: "product-card" }],
              },
            ],
          },
        ],
      },
    ],
  },
});

function find(node: BuilderNode, pred: (n: BuilderNode) => boolean): BuilderNode | null {
  if (pred(node)) return node;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...node.children, ...(node.emptyChildren ?? [])]
        : [];
  for (const k of kids) {
    const hit = find(k, pred);
    if (hit) return hit;
  }
  return null;
}

function collect(node: BuilderNode, out: BuilderNode[] = []): BuilderNode[] {
  out.push(node);
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...node.children, ...(node.emptyChildren ?? [])]
        : [];
  for (const k of kids) collect(k, out);
  return out;
}

for (const [site, make] of [
  ["chefs depot", cdTree],
  ["industry kitchens", ikTree],
] as const) {
  test(`${site}: the upsell rail is its own block, bound to upsell.products`, () => {
    const out = withUpsellBlock(make());
    const repeat = find(out.root, (n) => n.kind === "repeat" && n.source === "upsell.products");
    assert.ok(repeat, "an upsell repeat exists");
    // The related rail is untouched — two different merchandising sets.
    const related = find(out.root, (n) => n.kind === "repeat" && n.source === "related.products");
    assert.ok(related, "the related repeat still exists");
  });

  test(`${site}: it carries Zoey's heading, and the related rail keeps its own`, () => {
    const out = withUpsellBlock(make());
    const headings = collect(out.root)
      .filter((n): n is Extract<BuilderNode, { kind: "element" }> => n.kind === "element" && n.tag === "h2")
      .map((n) => (n.text ?? []).map((t) => (t.kind === "static" ? t.value : "")).join(""));
    assert.deepEqual(headings, [UPSELL_HEADING, "You may also like"]);
  });

  test(`${site}: the block hides itself when the product has no upsells`, () => {
    const out = withUpsellBlock(make());
    const block = collect(out.root).find((n) => n.id.startsWith("upsell-") && n.condition);
    assert.ok(block, "the cloned wrapper carries a condition");
    const c = block.condition!;
    const read = c.kind === "data" ? c.path : c.kind === "expr" ? c.source : "";
    assert.ok(read.startsWith("upsell.products"), `condition reads ${read}`);
    assert.ok(!read.includes("related."), "no related.* left in the clone");
  });

  test(`${site}: it reuses the related rail's own tile component`, () => {
    const out = withUpsellBlock(make());
    const repeat = find(out.root, (n) => n.kind === "repeat" && n.source === "upsell.products");
    assert.equal(repeat!.kind, "repeat");
    const tile = collect(repeat!).find((n) => n.kind === "component");
    assert.ok(tile, "the clone repeats a component");
    assert.equal((tile as Extract<BuilderNode, { kind: "component" }>).componentKey, "product-card");
  });

  test(`${site}: every id in the clone is unique against the original`, () => {
    const out = withUpsellBlock(make());
    const ids = collect(out.root).map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(",")}`);
  });

  test(`${site}: the upsell block sits ABOVE the related block`, () => {
    const out = withUpsellBlock(make());
    // Both blocks are children of the root: the clone must precede the original.
    const rootKids = (out.root as Extract<BuilderNode, { kind: "element" }>).children ?? [];
    const upsellAt = rootKids.findIndex((n) => n.id.startsWith("upsell-"));
    const relatedAt = rootKids.findIndex((n) => !n.id.startsWith("upsell-") && n.condition != null);
    assert.ok(upsellAt >= 0, "the clone is a sibling of the related block");
    assert.ok(relatedAt >= 0, "the related block is still there");
    assert.ok(upsellAt < relatedAt, "upsell precedes related");
  });

  test(`${site}: running twice changes nothing (idempotent, same object)`, () => {
    const once = withUpsellBlock(make());
    const twice = withUpsellBlock(once);
    assert.equal(twice, once);
  });

  test(`${site}: the ORIGINAL tree is never mutated`, () => {
    const tree = make();
    const before = JSON.stringify(tree);
    withUpsellBlock(tree);
    assert.equal(JSON.stringify(tree), before);
  });
}

test("a tree with no related rail is returned untouched", () => {
  const tree: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [] },
  };
  assert.equal(withUpsellBlock(tree), tree);
});

test("a rail with no heading gets NO block — an unlabelled twin reads as a repeat of the first", () => {
  const tree = cdTree();
  const wrap = (tree.root as Extract<BuilderNode, { kind: "element" }>).children![1] as Extract<
    BuilderNode,
    { kind: "element" }
  >;
  const inner = wrap.children![0] as Extract<BuilderNode, { kind: "element" }>;
  inner.children = [inner.children![1]]; // drop the h2, keep the grid
  assert.equal(withUpsellBlock(tree), tree);
});

test("a bare repeat with no conditional wrapper is left alone", () => {
  const tree: NodeTree = {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "grid",
          kind: "element",
          tag: "div",
          children: [
            {
              id: "rep",
              kind: "repeat",
              source: "related.products",
              children: [{ id: "card", kind: "component", componentKey: "product-card" }],
            },
          ],
        },
      ],
    },
  };
  assert.equal(withUpsellBlock(tree), tree);
});

test("an author's own upsell rail wins — we add nothing", () => {
  const tree = cdTree();
  const wrap = (tree.root as Extract<BuilderNode, { kind: "element" }>).children![1] as Extract<
    BuilderNode,
    { kind: "element" }
  >;
  const inner = wrap.children![0] as Extract<BuilderNode, { kind: "element" }>;
  const grid = inner.children![1] as Extract<BuilderNode, { kind: "element" }>;
  grid.children!.push({
    id: "mine",
    kind: "repeat",
    source: "upsell.products",
    children: [{ id: "mine-card", kind: "component", componentKey: "product-card" }],
  });
  assert.equal(withUpsellBlock(tree), tree);
});
