import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Placing the "not available for residential purchase" red line on the live
// product page (card HMtUxvwZ).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`; cards CXnP1lrL /
// uzeXShZu), so editing `ProductDetail.tsx` or `seeds/product.ts` ships nothing a
// customer can see. Same choice, and the same shape, as the illustrative-image
// banner (82HgV23q), the kit block (7bmpuqei) and the SilverChef panel (6f47rFeT):
// nothing is written to the stored trees, so a rollback has nothing to undo and
// the two live templates are not touched.
//
// ANCHOR. The card says "below the product description", so the leaf goes in as
// the NEXT SIBLING of the node that renders the description. Both live trees bind
// the short description as a rich binding on `product.descriptionShort` — CD's
// `short-desc-prose`, IK's `n-msh98zf7-kffs7` — so the anchor is found by BINDING
// rather than by node id, which is what makes one pass work on two independently
// authored templates and survive a re-author. A tree that binds the long
// `product.description` instead is anchored on that; a tree with neither falls
// back to the top of the root, visible rather than silently lost.
//
// IDEMPOTENT BY NODE ID. An author who places `product-residential-notice`
// themselves in the Site Builder keeps THEIR placement.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal editor
// reads the same object. The leaf renders NOTHING for a product that is not
// ticked, so it is safe on every product page.
// ============================================================================

/** The node id and native key. `product-natives` registers the leaf under this key. */
export const RESIDENTIAL_NOTICE_NODE_ID = "product-residential-notice";

/** Binding paths that mean "this node is the product's description", most-preferred first. */
const DESCRIPTION_PATHS = ["product.descriptionShort", "product.description"];

function noticeNode(): BuilderNode {
  return { id: RESIDENTIAL_NOTICE_NODE_ID, kind: "component", componentKey: RESIDENTIAL_NOTICE_NODE_ID };
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
 * The children we may SEARCH and INSERT into: an element's, and nothing else.
 * A repeat's children are ONE item subtree rendered per row (the related-products
 * rail), so an anchor found in there would put the line inside a product card —
 * on a DIFFERENT product, which is exactly the mistake `guardBuyControls` exists
 * to avoid on the buy row.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** True when this node renders `path` as its rich text. */
function bindsRich(node: BuilderNode, path: string): boolean {
  const rich = (node as { richBinding?: unknown }).richBinding;
  return typeof rich === "string" && rich === path;
}

/** The parent + child pair for the first node binding `path`, or null. */
function findBinder(
  node: BuilderNode,
  path: string,
  parent: BuilderNode | null
): { parent: BuilderNode; child: BuilderNode } | null {
  if (parent && bindsRich(node, path)) return { parent, child: node };
  for (const child of openChildrenOf(node)) {
    const hit = findBinder(child, path, node);
    if (hit) return hit;
  }
  return null;
}

/** Copy of `node` with the notice spliced in AFTER `child` of `parent`. */
function insertAfter(node: BuilderNode, parent: BuilderNode, child: BuilderNode): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const index = kids.indexOf(child);
    const next = [...kids];
    next.splice(index < 0 ? next.length : index + 1, 0, noticeNode());
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertAfter(k, parent, child)) };
}

/**
 * The product tree with the residential-restriction leaf in it, directly below the
 * description.
 *
 * Returns the SAME tree object when the leaf is already placed (an author put it
 * there, or this ran twice) so the common path allocates nothing.
 */
export function withResidentialNoticeNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, RESIDENTIAL_NOTICE_NODE_ID)) return tree;

  for (const path of DESCRIPTION_PATHS) {
    const hit = findBinder(tree.root, path, null);
    if (hit) return { ...tree, root: insertAfter(tree.root, hit.parent, hit.child) };
  }

  // No description to anchor against: the top of the root. Visible, if not exactly
  // under the description — better than a warning that quietly never renders.
  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [noticeNode(), ...openChildrenOf(tree.root)] } };
  }
  return tree;
}
