import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the free-text customisation panel ON the live product page
// (card kyMjCmAw).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree held in the database (`sf-product-page`), so a panel that
// has to be able to appear on ANY product on EITHER site cannot wait for two
// stored trees to be hand-edited. This is the third leaf placed this way, after
// `silverchef-node.ts` (6f47rFeT) and `product-image-notice` (82HgV23q), and it
// follows their rules exactly: pure, idempotent by node id, nothing written back
// to the stored tree, so a rollback has nothing to undo.
//
// ANCHOR. Zoey puts the Instructions box immediately above Qty and ADD TO QUOTE
// (the reference page, industrykitchens.com.au/custom-stainless-steel), so the
// panel goes BEFORE the actions row — the `actions-row` component instance, which
// both live trees carry (channel 1 published version 142, channel 2 version 207).
// Falling back: after the price panel, else at the end of the root's own
// children. A product page matching none of those still gets the panel rather
// than silently losing the one control the customer has to fill in, which is the
// failure nobody would notice until a quote arrived with no measurements on it.
//
// It renders NOTHING for a product with no text groups authored, so leaving it in
// front of every product page costs those pages nothing.
// ============================================================================

/** The node id and native key. `product-natives` registers the component here. */
export const PRODUCT_INSTRUCTIONS_NODE_ID = "product-instructions";

const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];
const PRICE_PANEL_KEYS = ["price-panel"];

function panelNode(): BuilderNode {
  return {
    id: PRODUCT_INSTRUCTIONS_NODE_ID,
    kind: "component",
    componentKey: PRODUCT_INSTRUCTIONS_NODE_ID,
  };
}

/** Every child, repeat subtrees included — used only to ask "is it ALREADY here",
 *  because an author who placed it inside a repeat still placed it. */
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
 * The children we may SEARCH and INSERT into: an element's, and nothing else.
 *
 * Deliberately not `anyChildOf`. A repeat's children are one ITEM subtree
 * rendered per row (the related-products rail carries its own price panel and its
 * own buy controls), so descending into it finds the wrong anchor, rebuilds a
 * subtree we may not insert into, and the panel vanishes from the whole
 * storefront with no error. Stopping at the repeat is what makes the fallbacks
 * fire instead. Same reasoning, verbatim, as `silverchef-node.ts`.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isComponent(node: BuilderNode, keys: readonly string[]): boolean {
  return node.kind === "component" && keys.includes(node.componentKey);
}

/** Insert the panel beside the first matching child, depth-first through ELEMENTS
 *  only. Returns null when nothing matched so the caller can try the next anchor. */
function insertBeside(
  node: BuilderNode,
  match: (child: BuilderNode) => boolean,
  before: boolean
): BuilderNode | null {
  if (node.kind !== "element") return null;
  const kids = openChildrenOf(node);
  if (!kids.length) return null;

  const index = kids.findIndex(match);
  if (index >= 0) {
    const next = [...kids];
    next.splice(before ? index : index + 1, 0, panelNode());
    return { ...node, children: next };
  }

  for (let i = 0; i < kids.length; i++) {
    const rebuilt = insertBeside(kids[i], match, before);
    if (rebuilt) {
      const next = [...kids];
      next[i] = rebuilt;
      return { ...node, children: next };
    }
  }
  return null;
}

/**
 * The product tree with the customisation panel in it.
 *
 * Returns the SAME tree object when the panel is already placed (an author put it
 * there in the Site Builder), so the common path allocates nothing and the
 * author's placement wins.
 */
export function withProductInstructionsNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, PRODUCT_INSTRUCTIONS_NODE_ID)) return tree;

  const placed =
    insertBeside(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true) ??
    insertBeside(tree.root, (child) => isComponent(child, PRICE_PANEL_KEYS), false);
  if (placed) return { ...tree, root: placed };

  if (tree.root.kind === "element") {
    return {
      ...tree,
      root: { ...tree.root, children: [...openChildrenOf(tree.root), panelNode()] },
    };
  }
  return tree;
}
