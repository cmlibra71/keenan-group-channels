import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the kit block — "What's included" / the bundle pickers — ON the live product page
// (card Tc5ekvD6; the placement card 7bmpuqei decided and never built).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an AUTHORED node
// tree stored in the database, and neither published tree carries a `product-kit` node (register
// `sf-product-page`: channel 1 page 69, channel 2 page 71). The native has been registered since
// 7bmpuqei and renders correctly once a node with its key is in the tree, so a block that must
// appear on every kit product on both sites is PLACED here at render time, exactly as the
// SilverChef panel, the extras and the Instructions box are. Nothing is written to the stored
// trees, so a rollback has nothing to undo, and the leaf renders nothing on a product that is not
// a kit, so every other product page is unchanged.
//
// ANCHOR. Immediately BEFORE the buy row: the shopper builds the bundle before pressing the
// button that buys it, and the build moves the headline price above. It shares the `actions-row`
// anchor with four other placers, each inserting before it, so whichever runs LAST lands nearest
// the buttons. This one runs INSIDE the Instructions and extras passes and OUTSIDE the pack note,
// so the page reads price -> pack sentence -> BUILD -> Instructions -> extras -> "we do not make
// that combination" -> buy row: the build is what the product IS, the instructions and extras
// qualify it, and the dead-button sentence stays last (the order is recorded in
// `product-node-branch.tsx` and on `sf-product-page`). Falling back: after the SilverChef panel,
// else after the price panel, else the end of the root's own children.
//
// NEVER INSIDE A REPEAT. A repeat's children are one ITEM subtree rendered once per row — the
// related-products and upsell rails carry their own price panel and buy button — so the walk
// stops at a repeat and the fallbacks fire instead (the trap `silverchef-node.ts` records).
//
// IDEMPOTENT. An author who placed the `product-kit` leaf in the Site Builder — under any node id —
// gets THEIR placement and the tree comes back untouched.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal editor reads the same
// object.
// ============================================================================

/** The node id and native key. `product-natives` registers the component under this key. */
export const PRODUCT_KIT_NODE_ID = "product-kit";

const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];
/** Fallback anchors, MOST SPECIFIC FIRST and tried one at a time (see product-addons-node.ts). */
const PRICE_ANCHOR_KEYS: readonly (readonly string[])[] = [["silverchef-panel"], ["price-panel"]];

function kitNode(): BuilderNode {
  return { id: PRODUCT_KIT_NODE_ID, kind: "component", componentKey: PRODUCT_KIT_NODE_ID };
}

/** Every child, repeat subtrees included — used ONLY to ask "is it already in this tree". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function isKitLeaf(node: BuilderNode): boolean {
  return (
    node.id === PRODUCT_KIT_NODE_ID ||
    (node.kind === "component" && node.componentKey === PRODUCT_KIT_NODE_ID)
  );
}

function hasKitLeaf(node: BuilderNode): boolean {
  return isKitLeaf(node) || anyChildOf(node).some(hasKitLeaf);
}

/** The children we may SEARCH and INSERT into: an element's, and nothing else. */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isComponent(node: BuilderNode, keys: readonly string[]): boolean {
  return node.kind === "component" && keys.includes(node.componentKey);
}

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
    next.splice(before ? index : index + 1, 0, kitNode());
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
 * The product tree with the kit block in it. Returns the SAME tree object when the block is
 * already placed, so the common path allocates nothing.
 */
export function withProductKitNode(tree: NodeTree): NodeTree {
  if (hasKitLeaf(tree.root)) return tree;

  let placed = insertBeside(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true);
  for (const keys of PRICE_ANCHOR_KEYS) {
    if (placed) break;
    placed = insertBeside(tree.root, (child) => isComponent(child, keys), false);
  }
  if (placed) return { ...tree, root: placed };

  // Last resort: the end of the root's own children — visible, if not beside the buy row, which
  // beats a picker that quietly never renders on a bundle nobody can then build.
  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [...openChildrenOf(tree.root), kitNode()] } };
  }
  return tree;
}
