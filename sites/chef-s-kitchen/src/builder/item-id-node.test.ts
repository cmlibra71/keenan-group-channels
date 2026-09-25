import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { ITEM_ID_NODE_ID, ITEM_ID_PATH, ITEM_ID_ROW_ID, withItemIdNode } from "./item-id-node.ts";
import { SEED_PRODUCT_TREE } from "./seeds/product.ts";

// Card 59ruI8uJ — the Item ID line directly above the SKU line. The two SKU-line
// shapes below are copied from the PUBLISHED product trees read off production on
// 2026-09-24 (Industry Kitchens page 69 / version 142, Chefs Depot page 71 /
// version 207); only unrelated siblings are trimmed.

const el = (id: string, children: BuilderNode[] = [], extra: Record<string, unknown> = {}): BuilderNode =>
  ({ id, kind: "element", tag: "div", classes: [], children, ...extra }) as BuilderNode;
const comp = (id: string, componentKey: string): BuilderNode => ({ id, kind: "component", componentKey });

/** Industry Kitchens: a `<p>` holding a "SKU: " span and a value span, in a plain column. */
const ikSkuLine = (): BuilderNode => ({
  id: "n-msh98zf7-ao8qn",
  tag: "p",
  kind: "element",
  label: "sku",
  classes: ["mt-1", "text-sm", "text-zinc-500"],
  children: [
    { id: "n-msh98zf7-klo85", tag: "span", kind: "element", text: [{ kind: "static", value: "SKU: " }], label: "prefix", classes: [] },
    { id: "n-msh98zf7-5rosq", tag: "span", kind: "element", text: [{ kind: "binding", path: "product.sku" }], label: "value", classes: [] },
  ],
  condition: { kind: "expr", source: "product.sku" },
});

const relatedRail = (skuPath = "card.sku"): BuilderNode => ({
  id: "related-repeat",
  kind: "repeat",
  source: "related.products",
  itemAlias: "card",
  children: [
    el("rc-card", [
      {
        id: "rc-sku",
        kind: "element",
        tag: "p",
        classes: ["spec-mono"],
        text: [{ kind: "static", value: "SKU: " }, { kind: "binding", path: skuPath }],
      },
    ]),
  ],
});

const ikTree = (): NodeTree => ({
  v: 1,
  root: el("n-msh98zf7-3fdh0", [
    el("n-msh98zf7-s6wjg", [
      comp("n-msh98zf7-sivdr", "product-gallery"),
      el("n-msh98zf7-rav55", [
        el("n-msh98zf7-hycar", [], { tag: "h1", text: [{ kind: "binding", path: "product.name" }] }),
        ikSkuLine(),
        comp("n-msh98zf7-bmy88", "price-panel"),
        comp("n-msh98zf7-pk63i", "actions-row"),
      ]),
    ]),
    el("related", [relatedRail()]),
  ]),
});

/** Chefs Depot: ONE `<p class="spec-mono">` inside a horizontal flex meta row, beside the review stars. */
const cdTree = (): NodeTree => ({
  v: 1,
  root: el("pdp-root", [
    el("overview-wrap", [
      el("overview", [
        comp("gallery", "product-gallery"),
        el("buy", [
          el("title", [], { tag: "h1", text: [{ kind: "binding", path: "product.name" }] }),
          el(
            "meta-row",
            [
              {
                id: "sku",
                tag: "p",
                kind: "element",
                text: [{ kind: "static", value: "SKU: " }, { kind: "binding", path: "product.sku" }],
                classes: ["spec-mono"],
                condition: { kind: "data", path: "product.sku" },
              },
              el("review-summary", [], { tag: "p", condition: { kind: "data", path: "purchase.reviewHasReviews" } }),
            ],
            { classes: ["mt-2", "flex", "flex-wrap", "items-center", "gap-x-4", "gap-y-1"] }
          ),
          comp("price-panel-inst", "price-panel"),
          // The Lainox notice binds product.sku too — but it is not a SKU line.
          {
            id: "p-msy3jgsj-n01vh",
            tag: "p",
            kind: "element",
            text: [
              { kind: "static", value: "Images are for illustrative purposes only – refer to spec sheet " },
              { kind: "binding", path: "product.sku" },
            ],
            classes: ["text-sm"],
            condition: { kind: "expr", source: 'brand.slug == "lainox"' },
          },
          comp("actions-row-inst", "actions-row"),
        ]),
      ]),
    ]),
    el("related-wrap", [relatedRail()]),
  ]),
});

const find = (node: BuilderNode, id: string): BuilderNode | null => {
  if (node.id === id) return node;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  for (const k of kids) {
    const hit = find(k, id);
    if (hit) return hit;
  }
  return null;
};

const ids = (node: BuilderNode): string[] => {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node.id, ...kids.flatMap(ids)];
};

const childIds = (node: BuilderNode | null): string[] =>
  node && node.kind === "element" ? (node.children ?? []).map((c) => c.id) : [];

test("Industry Kitchens: the Item ID line goes immediately ABOVE the SKU line, same tag and classes", () => {
  const out = withItemIdNode(ikTree());
  assert.deepEqual(childIds(find(out.root, "n-msh98zf7-rav55")), [
    "n-msh98zf7-hycar",
    ITEM_ID_NODE_ID,
    "n-msh98zf7-ao8qn",
    "n-msh98zf7-bmy88",
    "n-msh98zf7-pk63i",
  ]);
  const line = find(out.root, ITEM_ID_NODE_ID);
  assert.ok(line && line.kind === "element");
  assert.equal(line.tag, "p");
  assert.deepEqual(line.classes, ["mt-1", "text-sm", "text-zinc-500"]);
  // Shown only when there is a code — never a bare "Item ID:" label.
  assert.deepEqual(line.condition, { kind: "data", path: ITEM_ID_PATH });
  const [prefix, value] = line.children ?? [];
  assert.ok(prefix.kind === "element" && value.kind === "element");
  assert.deepEqual(prefix.text, [{ kind: "static", value: "Item ID: " }]);
  assert.deepEqual(value.text, [{ kind: "binding", path: ITEM_ID_PATH }]);
});

test("Chefs Depot: the line goes in a COPY of the flex meta row placed before it, so it sits above, not beside, the SKU", () => {
  const out = withItemIdNode(cdTree());
  assert.deepEqual(childIds(find(out.root, "buy")), [
    "title",
    ITEM_ID_ROW_ID,
    "meta-row",
    "price-panel-inst",
    "p-msy3jgsj-n01vh",
    "actions-row-inst",
  ]);
  const row = find(out.root, ITEM_ID_ROW_ID);
  assert.ok(row && row.kind === "element");
  assert.deepEqual(row.classes, ["mt-2", "flex", "flex-wrap", "items-center", "gap-x-4", "gap-y-1"]);
  assert.deepEqual(row.condition, { kind: "data", path: ITEM_ID_PATH });
  assert.deepEqual(childIds(row), [ITEM_ID_NODE_ID]);
  const line = find(out.root, ITEM_ID_NODE_ID);
  assert.ok(line && line.kind === "element");
  assert.deepEqual(line.classes, ["spec-mono"]);
  assert.deepEqual(line.text, [
    { kind: "static", value: "Item ID: " },
    { kind: "binding", path: ITEM_ID_PATH },
  ]);
  // The meta row itself — SKU and review stars — is untouched.
  assert.deepEqual(childIds(find(out.root, "meta-row")), ["sku", "review-summary"]);
});

test("the Lainox spec-sheet paragraph binds product.sku but is never mistaken for the SKU line", () => {
  const tree = cdTree();
  // Take the real SKU line away: the Lainox paragraph is all that binds product.sku now.
  const buy = find(tree.root, "buy");
  assert.ok(buy && buy.kind === "element");
  buy.children = (buy.children ?? []).filter((c) => c.id !== "meta-row");
  assert.equal(withItemIdNode(tree), tree);
});

test("listing tiles are untouched: the walk never enters a repeat, even when the tile binds product.sku", () => {
  // A tree whose ONLY SKU line is inside the related rail's repeat.
  const tree: NodeTree = { v: 1, root: el("root", [el("buy"), el("rail", [relatedRail("product.sku")])]) };
  assert.equal(withItemIdNode(tree), tree);

  const out = withItemIdNode(cdTree());
  const tile = find(out.root, "rc-card");
  assert.deepEqual(childIds(tile), ["rc-sku"]);
  assert.equal(ids(out.root).filter((id) => id.includes("item-id")).length, 2); // the row + the line, nothing in the rail
});

test("idempotent: an author who placed an Item ID line keeps theirs and gets the SAME tree back", () => {
  const once = withItemIdNode(ikTree());
  assert.equal(withItemIdNode(once), once);

  const authored = ikTree();
  const column = find(authored.root, "n-msh98zf7-rav55");
  assert.ok(column && column.kind === "element");
  column.children = [
    { id: "my-own-line", kind: "element", tag: "p", text: [{ kind: "binding", path: ITEM_ID_PATH }] },
    ...(column.children ?? []),
  ];
  assert.equal(withItemIdNode(authored), authored);
});

test("a tree with no SKU line is returned as-is — there is nothing to sit above", () => {
  const tree: NodeTree = { v: 1, root: el("root", [el("title"), comp("p", "price-panel")]) };
  assert.equal(withItemIdNode(tree), tree);
});

test("pure: the stored tree is never mutated, and every id on the page stays unique", () => {
  for (const make of [ikTree, cdTree]) {
    const input = make();
    const before = JSON.stringify(input);
    const out = withItemIdNode(input);
    assert.equal(JSON.stringify(input), before);
    const all = ids(out.root);
    assert.equal(new Set(all).size, all.length);
  }
});

test("the seed tree (a site that never authored one) gets the line above its SKU line too", () => {
  const out = withItemIdNode(SEED_PRODUCT_TREE);
  assert.notEqual(out, SEED_PRODUCT_TREE);
  assert.ok(find(out.root, ITEM_ID_NODE_ID));
  const all = ids(out.root);
  assert.equal(new Set(all).size, all.length);
});
