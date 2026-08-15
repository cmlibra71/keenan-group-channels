import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the SilverChef panel ON the live product page (card 6f47rFeT).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`, cards CXnP1lrL
// / uzeXShZu): editing ProductDetail.tsx or the seed ships nothing a customer
// sees. A panel that has to appear on EVERY product page on BOTH sites can
// therefore only arrive two ways — somebody hand-edits two stored trees in the
// Site Builder, or the branch places the leaf at render time. This is the
// second, for the reasons the kit block chose it: nothing is written to the
// stored trees, so a rollback has nothing to undo.
//
// IDEMPOTENT BY NODE ID. An author who places `silverchef-panel` themselves in
// the Site Builder gets THEIR placement — we find the id already there and
// leave the tree alone.
//
// ANCHOR. The card's mock has the panel beside the price box, so it goes
// immediately after the price panel — the `price-panel` component instance,
// which both live trees carry (channel 1 version 142, channel 2 version 97).
// Falling back: before the actions row (the buy buttons), else at the end of
// the buy column's parent, else after the root's first child. A product page
// that matches none of those still gets the panel rather than silently losing
// it, which is the failure mode nobody would notice.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object.
// ============================================================================

/** The node id and native key. Both sides must agree: `product-natives`
 *  registers the component under this key. */
export const SILVERCHEF_NODE_ID = "silverchef-panel";

const PRICE_PANEL_KEYS = ["price-panel"];
const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];

function panelNode(): BuilderNode {
  return { id: SILVERCHEF_NODE_ID, kind: "component", componentKey: SILVERCHEF_NODE_ID };
}

/** Every child, repeat subtrees included. Used only to ask "is the panel
 *  ALREADY somewhere in this tree" — an author who placed it inside a repeat
 *  still placed it, and we leave their tree alone. */
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
 * Deliberately NOT `anyChildOf`. A repeat's children are one ITEM subtree
 * rendered once per row (the related-products strip carries its own price
 * panel), so the anchor we want is never in there — and a walk that descends
 * into a repeat finds that price panel FIRST, rebuilds a subtree it may not
 * insert into, and the panel disappears from the whole storefront with no
 * error. Stopping at the repeat is what makes the anchor fallbacks fire
 * instead.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isComponent(node: BuilderNode, keys: readonly string[]): boolean {
  return node.kind === "component" && keys.includes(node.componentKey);
}

/**
 * Insert the panel after the first child matching `match`, depth-first through
 * ELEMENTS ONLY.
 * Returns null when nothing matched, so the caller can try the next anchor.
 */
function insertAfter(
  node: BuilderNode,
  match: (child: BuilderNode) => boolean,
  before = false
): BuilderNode | null {
  // Only an ELEMENT can gain a child, and only an element's children are worth
  // walking — see openChildrenOf. A repeat or a component ref ends the walk.
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
    const rebuilt = insertAfter(kids[i], match, before);
    if (rebuilt) {
      const next = [...kids];
      next[i] = rebuilt;
      return { ...node, children: next };
    }
  }
  return null;
}

/**
 * The product tree with the SilverChef panel in it.
 *
 * Returns the SAME tree object when the panel is already placed (an author put
 * it there) so the common path allocates nothing.
 */
export function withSilverChefNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, SILVERCHEF_NODE_ID)) return tree;

  const placed =
    insertAfter(tree.root, (child) => isComponent(child, PRICE_PANEL_KEYS)) ??
    insertAfter(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true);
  if (placed) return { ...tree, root: placed };

  // Last resort: the end of the root's own children. Visible, if not beside the
  // price — better than a panel that quietly never renders.
  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [...openChildrenOf(tree.root), panelNode()] } };
  }
  return tree;
}
