import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the Chefs Depot member-pricing panel ON the live product page
// (card Nyp8bkPm).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`, cards CXnP1lrL /
// uzeXShZu): editing a component or the seed ships nothing a customer sees. A
// panel that has to appear on EVERY Chefs Depot product page can therefore only
// arrive two ways — somebody hand-edits the stored tree in the Site Builder, or
// the branch places the leaf at render time. This is the second, exactly as the
// SilverChef panel does, and for the same reason: nothing is written to the
// stored tree, so a rollback has nothing to undo.
//
// ANCHOR. The three prices belong with the price, so the panel goes immediately
// after the SilverChef panel where that is present (which itself sits after the
// price panel), else after the price panel, else before the buy actions row,
// else at the end of the root. A product page that matches none of those still
// gets the panel rather than silently losing it.
//
// IDEMPOTENT BY NODE ID. An author who places `cd-member-pricing` themselves in
// the Site Builder keeps THEIR placement.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object.
//
// The walk is `silverchef-node.ts`'s, including its repeat rule: a repeat's
// children are ONE item subtree rendered once per row, and the related-products
// strip carries its own price panel, so a walk that descends into a repeat finds
// the wrong anchor first and the panel disappears from the whole storefront with
// no error anywhere.
// ============================================================================

/** The node id and native key. `product-natives` registers the component under this key. */
export const CD_MEMBER_PRICING_NODE_ID = "cd-member-pricing";

const SILVERCHEF_KEYS = ["silverchef-panel"];
const PRICE_PANEL_KEYS = ["price-panel"];
const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];

function panelNode(): BuilderNode {
  return {
    id: CD_MEMBER_PRICING_NODE_ID,
    kind: "component",
    componentKey: CD_MEMBER_PRICING_NODE_ID,
  };
}

/** Every child, repeat subtrees included — used ONLY to ask "is it already here". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function hasNode(node: BuilderNode, id: string): boolean {
  if (node.id === id) return true;
  return anyChildOf(node).some((child) => hasNode(child, id));
}

/** The children we may SEARCH and INSERT into: an element's, and nothing else. */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isComponent(node: BuilderNode, keys: readonly string[]): boolean {
  return node.kind === "component" && keys.includes(node.componentKey);
}

function matchesId(node: BuilderNode, id: string): boolean {
  return node.id === id;
}

function insertAfter(
  node: BuilderNode,
  match: (child: BuilderNode) => boolean,
  before = false
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
 * The product tree with the member-pricing panel in it.
 *
 * Returns the SAME tree object when the panel is already placed, so the common
 * path allocates nothing. The panel itself renders null on a channel that does
 * not run the membership model, on a product whose price is hidden and on a SKU
 * whose M/W/R row is held — so placing the leaf on every product page is safe.
 */
export function withCdMemberPricingNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, CD_MEMBER_PRICING_NODE_ID)) return tree;

  const placed =
    // After the SilverChef panel, which the branch has already placed after the
    // price panel — so the money block reads price, weekly rent, then ladder.
    insertAfter(tree.root, (child) => matchesId(child, "silverchef-panel")) ??
    insertAfter(tree.root, (child) => isComponent(child, SILVERCHEF_KEYS)) ??
    insertAfter(tree.root, (child) => isComponent(child, PRICE_PANEL_KEYS)) ??
    insertAfter(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true);
  if (placed) return { ...tree, root: placed };

  if (tree.root.kind === "element") {
    return {
      ...tree,
      root: { ...tree.root, children: [...openChildrenOf(tree.root), panelNode()] },
    };
  }
  return tree;
}
