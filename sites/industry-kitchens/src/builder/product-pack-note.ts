import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Placing the "Carton contains 12 Pcs" line on the live product page
// (cards O108e4jH / zeMPVcA3).
//
// WHY CODE AND NOT AUTHORING — the same reason as `product-image-notice.ts`:
// both storefronts render this page from an AUTHORED node tree stored in the
// database (`sf-product-page`; cards CXnP1lrL / uzeXShZu), so editing a React
// page or a seed ships nothing a customer can see. A line that must be able to
// appear on ANY product on BOTH sites therefore arrives either by somebody
// hand-editing two stored trees, or by the branch placing the leaf at render
// time. This is the second.
//
// ANCHOR. Zoey puts the sentence between the price and the buy buttons, and
// both live trees carry the same two component instances in that order inside
// the buy column: `price-panel` then `actions-row` (verified against the
// published trees, channel 2 page 71 v207 and channel 1 page 69 v142, on
// 2026-09-05). So: insert immediately BEFORE the `actions-row` instance; if a
// tree has none, immediately AFTER the `price-panel`; failing both, at the top
// of the root, because a line in the wrong place still beats a line that
// silently never renders.
//
// IDEMPOTENT BY NODE ID. An author who places `product-pack-note` themselves in
// the Site Builder keeps THEIR placement.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object. The leaf renders NOTHING for a product that is
// not sold by the pack, so it is safe on every product page.
// ============================================================================

/** The node id and native key. `product-natives` registers the leaf under this key. */
export const PACK_NOTE_NODE_ID = "product-pack-note";

const ACTIONS_KEY = "actions-row";
const PRICE_KEY = "price-panel";

function packNoteNode(): BuilderNode {
  return { id: PACK_NOTE_NODE_ID, kind: "component", componentKey: PACK_NOTE_NODE_ID };
}

/** Every child, repeat subtrees included — only ever used to ask "is it already here?". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function hasNode(node: BuilderNode, id: string): boolean {
  if (node.id === id) return true;
  return anyChildOf(node).some((child) => hasNode(child, id));
}

/**
 * The children we may SEARCH and INSERT into: an element's, and nothing else. A repeat's children
 * are ONE item subtree rendered per row (the related-products rail), so an anchor found in there
 * would put the line inside a product card.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** The element holding a component instance with this key, and the instance itself. */
function findHost(
  node: BuilderNode,
  componentKey: string
): { parent: BuilderNode; child: BuilderNode } | null {
  for (const child of openChildrenOf(node)) {
    if (child.kind === "component" && child.componentKey === componentKey) {
      return { parent: node, child };
    }
    const hit = findHost(child, componentKey);
    if (hit) return hit;
  }
  return null;
}

/** Copy of `node` with the leaf spliced in beside `child` of `parent`. */
function insertBeside(
  node: BuilderNode,
  parent: BuilderNode,
  child: BuilderNode,
  where: "before" | "after"
): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const index = kids.indexOf(child);
    const at = index < 0 ? kids.length : where === "before" ? index : index + 1;
    const next = [...kids];
    next.splice(at, 0, packNoteNode());
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertBeside(k, parent, child, where)) };
}

/**
 * The product tree with the pack-note leaf in it.
 *
 * Returns the SAME tree object when the leaf is already placed (an author put it there, or this
 * ran twice) so the common path allocates nothing.
 */
export function withPackNoteNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, PACK_NOTE_NODE_ID)) return tree;

  const actions = findHost(tree.root, ACTIONS_KEY);
  if (actions) {
    return { ...tree, root: insertBeside(tree.root, actions.parent, actions.child, "before") };
  }

  const price = findHost(tree.root, PRICE_KEY);
  if (price) {
    return { ...tree, root: insertBeside(tree.root, price.parent, price.child, "after") };
  }

  if (tree.root.kind !== "element") return tree;
  return {
    ...tree,
    root: { ...tree.root, children: [packNoteNode(), ...(tree.root.children ?? [])] },
  };
}
