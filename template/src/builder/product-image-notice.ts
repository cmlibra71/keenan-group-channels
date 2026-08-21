import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Placing the "images are illustrative" banner on the live product page
// (card 82HgV23q, Tim 2026-08-17).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`; cards CXnP1lrL /
// uzeXShZu), so editing `ProductDetail.tsx` or `seeds/product.ts` ships nothing
// a customer can see. A banner that has to be able to appear on ANY product on
// BOTH sites therefore arrives either by somebody hand-editing two stored trees
// in the Site Builder, or by the branch placing the leaf at render time. This is
// the second, the same choice the kit block (7bmpuqei) and the SilverChef panel
// (6f47rFeT) made: nothing is written to the stored trees, so a rollback has
// nothing to undo, and the two live templates are not touched.
//
// IDEMPOTENT BY NODE ID. An author who places `product-image-notice` themselves
// in the Site Builder keeps THEIR placement — we find the id already there and
// leave the tree alone.
//
// ANCHOR. The card's design is a full-content-width panel, so it goes
// immediately ABOVE the gallery/buy block, inside whatever already sets the page
// width. Concretely: find the `product-gallery` leaf, walk back up to the
// outermost block that still sits inside a width-constrained parent (or inside
// the root), and insert before that block. That is `overview-wrap`'s grid on
// Chefs Depot (its root is bare and each section wraps itself) and the two-column
// grid on Industry Kitchens (whose ROOT carries `mx-auto max-w-7xl px-4 …`),
// both verified against the live published trees on 2026-08-17. A tree with no
// gallery at all still gets the banner, at the top of the root, rather than
// silently losing it.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object. The banner renders NOTHING for a product that is
// not ticked, so the leaf is safe on every product page.
// ============================================================================

/** The node id and native key. `product-natives` registers the leaf under this key. */
export const IMAGE_NOTICE_NODE_ID = "product-image-notice";

/** The gallery leaf we anchor against — the same key `product-natives` seals. */
const GALLERY_KEY = "product-gallery";

function noticeNode(): BuilderNode {
  return { id: IMAGE_NOTICE_NODE_ID, kind: "component", componentKey: IMAGE_NOTICE_NODE_ID };
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
 * rail), so an anchor found in there would put the banner inside a product card.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** True for a block that already decides the page's content width. */
function isWidthConstrained(node: BuilderNode): boolean {
  if (node.kind !== "element") return false;
  const classes = node.classes ?? [];
  return classes.some((c) => c === "mx-auto" || c.startsWith("max-w-"));
}

/** Root → … → gallery, or null when this tree has no gallery leaf. */
function pathToGallery(node: BuilderNode, trail: BuilderNode[]): BuilderNode[] | null {
  if (node.kind === "component" && node.componentKey === GALLERY_KEY) return [...trail, node];
  for (const child of openChildrenOf(node)) {
    const hit = pathToGallery(child, [...trail, node]);
    if (hit) return hit;
  }
  return null;
}

/** Copy of `node` with the notice spliced in before `child` of `parent`. */
function insertBefore(node: BuilderNode, parent: BuilderNode, child: BuilderNode): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const index = kids.indexOf(child);
    const next = [...kids];
    next.splice(index < 0 ? 0 : index, 0, noticeNode());
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertBefore(k, parent, child)) };
}

/**
 * The product tree with the illustrative-image banner leaf in it.
 *
 * Returns the SAME tree object when the leaf is already placed (an author put it
 * there, or this ran twice) so the common path allocates nothing.
 */
export function withImageNoticeNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, IMAGE_NOTICE_NODE_ID)) return tree;

  const path = pathToGallery(tree.root, []);
  if (path && path.length >= 2) {
    // Walk back up from the gallery: the anchor is the DEEPEST block whose own
    // parent already sets the content width (or is the root itself).
    for (let i = path.length - 2; i >= 1; i--) {
      const parent = path[i - 1];
      if (i - 1 === 0 || isWidthConstrained(parent)) {
        return { ...tree, root: insertBefore(tree.root, parent, path[i]) };
      }
    }
  }

  // No gallery to anchor against: the top of the root. Visible, if not exactly
  // above the images — better than a banner that quietly never renders.
  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [noticeNode(), ...openChildrenOf(tree.root)] } };
  }
  return tree;
}
