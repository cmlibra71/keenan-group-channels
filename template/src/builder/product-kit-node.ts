import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the bundle / grouped-kit contents ON the live product page.
//
// The sealed `product-kit` native has been registered in `product-natives.tsx`
// since card 7bmpuqei, and the route has handed it `nativeData.kit` ever since —
// but no stored product tree PLACES the node, so a bundle's contents render
// nowhere (IK parity audit 2026-09-28: Industry Kitchens template 69 has no
// `product-kit` node; e.g. Hoshizaki KMD-270AB carries 7 kit rows and shows none).
//
// WHY CODE AND NOT AUTHORING: same reason as `product-addons-node.ts`. Both
// storefronts render the product page from an AUTHORED tree in the database, so
// a block that must reach every kit product on BOTH sites either waits for two
// stored trees to be hand-edited or is placed at render time. Nothing is written
// back, so a rollback has nothing to undo. The native renders NULL for a product
// that is not a kit, so every other product page is unchanged.
//
// ANCHOR: immediately BEFORE the actions row — the shopper sees what is in the
// kit (and, for a bundle, makes the picks its own Add to Quote carries) before
// the buy buttons. Failing that, after the SilverChef panel / price panel; last
// resort, the end of the root's own children.
//
// IDEMPOTENT: an author who placed `product-kit` themselves (by id or by
// component key) keeps THEIR placement and the tree comes back untouched.
//
// PURE. Never mutates the stored tree.
// ============================================================================

/** The node id and native key. `product-natives` registers the component under this key. */
export const PRODUCT_KIT_NODE_ID = "product-kit";

const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];
/** Fallback anchors, most specific first, tried one at a time (see product-addons-node.ts). */
const PRICE_ANCHOR_KEYS: readonly (readonly string[])[] = [["silverchef-panel"], ["price-panel"]];

function kitNode(): BuilderNode {
  return { id: PRODUCT_KIT_NODE_ID, kind: "component", componentKey: PRODUCT_KIT_NODE_ID };
}

/** Every child, repeat subtrees included — used ONLY for "is it already placed". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function alreadyPlaced(node: BuilderNode): boolean {
  if (node.id === PRODUCT_KIT_NODE_ID) return true;
  if (node.kind === "component" && node.componentKey === PRODUCT_KIT_NODE_ID) return true;
  return anyChildOf(node).some(alreadyPlaced);
}

/** Elements only: a repeat's children are one related-product TILE, never an anchor. */
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

/** The product tree with the kit contents block in it (same object back when already placed). */
export function withProductKitNode(tree: NodeTree): NodeTree {
  if (alreadyPlaced(tree.root)) return tree;

  let placed = insertBeside(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true);
  for (const keys of PRICE_ANCHOR_KEYS) {
    if (placed) break;
    placed = insertBeside(tree.root, (child) => isComponent(child, keys), false);
  }
  if (placed) return { ...tree, root: placed };

  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [...openChildrenOf(tree.root), kitNode()] } };
  }
  return tree;
}
