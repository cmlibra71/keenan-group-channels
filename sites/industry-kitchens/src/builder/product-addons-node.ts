import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the paid-extras panel ON the live product page (card 0CDcCYmO).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`, cards CXnP1lrL
// / uzeXShZu): editing a component or the seed ships nothing a customer sees. A
// panel that has to appear on every product page on BOTH sites can therefore
// only arrive two ways — somebody hand-edits two stored trees in the Site
// Builder, or the branch places the leaf at render time. This is the second,
// for the same reason the SilverChef panel chose it: nothing is written to the
// stored trees, so a rollback has nothing to undo.
//
// ANCHOR. The extras have to sit between the price and the buy buttons — a
// shopper must meet them BEFORE Add to Cart, because ticking one changes what
// that button will charge. So: immediately BEFORE the actions row; failing
// that, after the price panel (or after the SilverChef panel where one has
// already been inserted there, so the two do not fight over the same slot);
// last resort, the end of the root's own children. A product page matching none
// of those still gets the panel rather than silently losing it.
//
// ORDER MATTERS AT THE CALL SITE. `withSilverChefNode` runs first and inserts
// after `price-panel`; this pass then inserts before the actions row, which is
// below it. Running them the other way round would still work — the fallbacks
// are written so neither can displace the other — but the live order is
// price → weekly rent → extras → buy.
//
// IDEMPOTENT BY NODE ID. An author who places `product-addons` themselves in
// the Site Builder gets THEIR placement: we find the id already there and leave
// the tree alone.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object.
// ============================================================================

/** The node id and native key. `product-natives` registers the component under this key. */
export const PRODUCT_ADDONS_NODE_ID = "product-addons";

const ACTIONS_KEYS = ["actions-row", "add-to-cart", "buy-actions"];
/**
 * The fallback anchors, MOST SPECIFIC FIRST and tried one at a time.
 *
 * They cannot be one list: `insertBeside` takes the first child matching ANY key it is
 * given, and the SilverChef panel sits BELOW the price panel — so a single list would
 * match `price-panel` first and drop the extras above the weekly rent instead of below it.
 */
const PRICE_ANCHOR_KEYS: readonly (readonly string[])[] = [["silverchef-panel"], ["price-panel"]];

function panelNode(): BuilderNode {
  return {
    id: PRODUCT_ADDONS_NODE_ID,
    kind: "component",
    componentKey: PRODUCT_ADDONS_NODE_ID,
  };
}

/** Every child, repeat subtrees included — used ONLY to ask "is it already in
 *  this tree", because an author who placed it inside a repeat still placed it. */
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
 * rendered once per row, and the related-products strip carries its own price
 * panel and its own buy button — so a walk that descends into a repeat finds
 * the wrong anchor first, rebuilds a subtree it may not insert into, and the
 * panel disappears from the whole storefront with no error anywhere. Stopping
 * at the repeat is what makes the anchor fallbacks fire instead. (The same trap
 * `silverchef-node.ts` records; its first cut had it.)
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isComponent(node: BuilderNode, keys: readonly string[]): boolean {
  return node.kind === "component" && keys.includes(node.componentKey);
}

/**
 * Insert the panel next to the first child matching `match`, depth-first
 * through ELEMENTS ONLY. Returns null when nothing matched, so the caller can
 * try the next anchor.
 */
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
 * The product tree with the extras panel in it.
 *
 * Returns the SAME tree object when the panel is already placed (an author put
 * it there), so the common path allocates nothing.
 */
export function withAddonsNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, PRODUCT_ADDONS_NODE_ID)) return tree;

  let placed = insertBeside(tree.root, (child) => isComponent(child, ACTIONS_KEYS), true);
  for (const keys of PRICE_ANCHOR_KEYS) {
    if (placed) break;
    placed = insertBeside(tree.root, (child) => isComponent(child, keys), false);
  }
  if (placed) return { ...tree, root: placed };

  // Last resort: the end of the root's own children. Visible, if not beside the
  // buy button — better than a panel that quietly never renders.
  if (tree.root.kind === "element") {
    return {
      ...tree,
      root: { ...tree.root, children: [...openChildrenOf(tree.root), panelNode()] },
    };
  }
  return tree;
}
