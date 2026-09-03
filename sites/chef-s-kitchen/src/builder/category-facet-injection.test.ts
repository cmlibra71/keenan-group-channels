import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import {
  ATTRIBUTE_FACETS_NODE_ID,
  PRICE_SLIDER_NODE_ID,
  withCategoryFacetComponents,
  withCategoryFacetNodes,
} from "./category-facet-injection";

// ── Fixtures ────────────────────────────────────────────────────────────────
// The shape of BOTH live rails: a card with a header and one group per facet,
// each group holding a repeat over `listing.facets.<collection>`. Chefs Depot's
// `filter-rail` master and Industry Kitchens' `filter-rail-content` share no
// node ids, which is why the anchor is the shape and not an id.

const facetGroup = (id: string, source: string): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  label: id,
  children: [
    { id: `${id}-header`, kind: "element", tag: "div", text: [{ kind: "static", value: id }] },
    {
      id: `${id}-options`,
      kind: "element",
      tag: "div",
      children: [
        {
          id: `${id}-repeat`,
          kind: "repeat",
          source,
          itemAlias: "option",
          children: [{ id: `${id}-opt`, kind: "component", componentKey: "facet-option" }],
        },
      ],
    },
  ],
});

const railTree = (): NodeTree => ({
  v: 1,
  root: {
    id: "rail-card",
    kind: "element",
    tag: "div",
    children: [
      {
        id: "rail-header",
        kind: "element",
        tag: "div",
        children: [{ id: "clear", kind: "component", componentKey: "clear-filters" }],
      },
      facetGroup("group-sub", "listing.facets.subcategories"),
      facetGroup("group-brand", "listing.facets.brands"),
      facetGroup("group-price", "listing.facets.price"),
      facetGroup("group-stock", "listing.facets.availability"),
    ],
  },
});

/** Depth-first list of every node id in the tree, repeat subtrees included. */
function ids(node: BuilderNode, out: string[] = []): string[] {
  out.push(node.id);
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  for (const k of kids) ids(k, out);
  return out;
}

function childIds(tree: NodeTree): string[] {
  const root = tree.root;
  return root.kind === "element" ? (root.children ?? []).map((c) => c.id) : [];
}

// ── Placement ───────────────────────────────────────────────────────────────

test("attribute sections are placed after the LAST authored facet group", () => {
  const out = withCategoryFacetNodes(railTree());
  assert.deepEqual(childIds(out), [
    "rail-header",
    "group-sub",
    "group-brand",
    "group-price",
    "group-stock",
    ATTRIBUTE_FACETS_NODE_ID,
  ]);
});

test("the price band repeat becomes the slider leaf, and its group keeps its header", () => {
  const out = withCategoryFacetNodes(railTree());
  const all = ids(out.root);
  assert.ok(all.includes(PRICE_SLIDER_NODE_ID), "slider leaf placed");
  assert.ok(!all.includes("group-price-repeat"), "band repeat replaced");
  // The authored group and its heading survive — only the option list moved.
  assert.ok(all.includes("group-price"), "group kept");
  assert.ok(all.includes("group-price-header"), "authored heading kept");
  // Every other facet repeat is untouched.
  assert.ok(all.includes("group-brand-repeat"), "brand repeat kept");
  assert.ok(all.includes("group-sub-repeat"), "sub repeat kept");
});

test("a rail whose LAST group is Price still gets the sections BELOW Price", () => {
  // Industry Kitchens' shape: Subcategory, Brand, Price and no availability
  // group. Swapping the price bands for the slider removes the repeat the
  // anchor is looking for, so the placement has to be decided first — otherwise
  // the attribute sections land above Price instead of under it.
  const tree: NodeTree = {
    v: 1,
    root: {
      id: "rail-card",
      kind: "element",
      tag: "div",
      children: [
        facetGroup("group-sub", "listing.facets.subcategories"),
        facetGroup("group-brand", "listing.facets.brands"),
        facetGroup("group-price", "listing.facets.price"),
      ],
    },
  };
  const out = withCategoryFacetNodes(tree);
  assert.deepEqual(childIds(out), [
    "group-sub",
    "group-brand",
    "group-price",
    ATTRIBUTE_FACETS_NODE_ID,
  ]);
  assert.ok(ids(out.root).includes(PRICE_SLIDER_NODE_ID), "slider still placed");
});

test("a tree with no facet repeat is returned unchanged, by reference", () => {
  const tree: NodeTree = {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [{ id: "card", kind: "component", componentKey: "product-card" }],
    },
  };
  assert.equal(withCategoryFacetNodes(tree), tree);
});

test("running twice changes nothing — an author's own placement is kept", () => {
  const once = withCategoryFacetNodes(railTree());
  const twice = withCategoryFacetNodes(once);
  assert.equal(twice, once, "second pass is a no-op by reference");
  assert.equal(
    ids(twice.root).filter((id) => id === ATTRIBUTE_FACETS_NODE_ID).length,
    1,
    "sections placed exactly once"
  );
});

test("an author who placed the leaves themselves keeps their placement", () => {
  const authored = railTree();
  const root = authored.root as { children: BuilderNode[] };
  root.children.splice(1, 0, {
    id: ATTRIBUTE_FACETS_NODE_ID,
    kind: "component",
    componentKey: ATTRIBUTE_FACETS_NODE_ID,
  });
  const out = withCategoryFacetNodes(authored);
  assert.equal(childIds(out)[1], ATTRIBUTE_FACETS_NODE_ID, "left where the author put it");
  assert.equal(
    childIds(out).filter((id) => id === ATTRIBUTE_FACETS_NODE_ID).length,
    1,
    "not added a second time"
  );
});

test("the deepest container holding the most groups wins the anchor", () => {
  // An outer wrapper contains the card; the card holds the groups. The sections
  // must land beside the groups, not beside the card.
  const inner = railTree().root;
  const tree: NodeTree = {
    v: 1,
    root: { id: "outer", kind: "element", tag: "div", children: [inner] },
  };
  const out = withCategoryFacetNodes(tree);
  const outer = out.root as { children: BuilderNode[] };
  assert.equal(outer.children.length, 1, "nothing added to the wrapper");
  const card = outer.children[0] as { children: BuilderNode[] };
  assert.equal(card.children[card.children.length - 1].id, ATTRIBUTE_FACETS_NODE_ID);
});

test("the pass never mutates the stored tree", () => {
  const tree = railTree();
  const before = JSON.stringify(tree);
  withCategoryFacetNodes(tree);
  assert.equal(JSON.stringify(tree), before);
});

// ── Component map ───────────────────────────────────────────────────────────

test("only the component that carries the groups is patched", () => {
  // Industry Kitchens' shape: `filter-rail` and `filter-drawer` both PLACE
  // `filter-rail-content`, which is where the groups actually live.
  const wrapper = (key: string): NodeTree => ({
    v: 1,
    root: {
      id: `${key}-root`,
      kind: "element",
      tag: "div",
      children: [{ id: `${key}-inst`, kind: "component", componentKey: "filter-rail-content" }],
    },
  });
  const components = {
    "filter-rail": wrapper("filter-rail"),
    "filter-drawer": wrapper("filter-drawer"),
    "filter-rail-content": railTree(),
    "product-card": wrapper("product-card"),
  };
  const out = withCategoryFacetComponents(components);
  assert.equal(out["filter-rail"], components["filter-rail"], "wrapper untouched");
  assert.equal(out["filter-drawer"], components["filter-drawer"], "drawer untouched");
  assert.notEqual(out["filter-rail-content"], components["filter-rail-content"]);
  assert.ok(ids(out["filter-rail-content"].root).includes(ATTRIBUTE_FACETS_NODE_ID));
});

test("a component map with no rail in it is returned by reference", () => {
  const components = {
    "product-card": {
      v: 1 as const,
      root: { id: "pc", kind: "element" as const, tag: "div" },
    },
  };
  assert.equal(withCategoryFacetComponents(components), components);
});
