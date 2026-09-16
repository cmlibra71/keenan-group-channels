import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the REAL review block back on the built product page (card qxVqy5Dn).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`, cards CXnP1lrL
// / uzeXShZu): editing ProductTabs.tsx or the seed ships nothing a customer
// sees. Chefs Depot's stored `product-tabs` master carries a Reviews panel that
// repeats `reviews.list` and prints each review's TITLE and BODY only — no
// stars, no reviewer name, no date, and no way to write one. The complete block
// has existed in `components/product/ProductTabs.tsx` (`ReviewsSection`) the
// whole time; nothing a customer sees rendered it.
//
// A REVIEW FORM CANNOT BE AUTHORED HERE. It needs client state (the star
// picker), a server action and its result handling. So the panel's children are
// swapped at render time for a single SEALED leaf, exactly the way the
// SilverChef panel and the "images are illustrative" banner are placed
// (`silverchef-node.ts` is the shape this file copies).
//
// KEY. The leaf is `product-reviews-panel`, NOT `product-reviews`: Industry
// Kitchens already owns a MASTER under the key `product-reviews` (channel 1,
// `cms_components`), and a native must never share a key with a master — the
// two would fight over which one the renderer resolves.
//
// AN AUTHORED FORM IS REPLACED TOO, and that is deliberate. Industry Kitchens
// authored its own version of this block — the same fields the old
// ProductTabs form had, node-ified: "Your Name", "Title (optional)", a rating
// with no measure named, and no spam trap. Leaving it would mean the two
// storefronts ask for different things and, worse, that IK's form calls a
// title optional while the action now requires one (Zoey requires it, and the
// card matches Zoey's fields exactly). So wherever the swap fires, any element
// firing `submitReview` goes with the list it belonged to: one implementation,
// one set of fields, both sites. Nothing is written back, so an author who
// re-authors the panel gets it back on the next publish.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object. Idempotent by node id, so an author who places
// `product-reviews-panel` themselves keeps their placement. Nothing is written
// back, so a rollback has nothing to undo.
// ============================================================================

/** The node id and native key. Both sides must agree: `product-natives`
 *  registers the component under this key. */
export const PRODUCT_REVIEWS_NODE_ID = "product-reviews-panel";

/** The binding every reviews repeat on either site reads. */
const REVIEWS_SOURCE = "reviews.list";

/** The action name an authored review FORM fires. */
const SUBMIT_ACTION = "submitReview";

function leafNode(): BuilderNode {
  return {
    id: PRODUCT_REVIEWS_NODE_ID,
    kind: "component",
    componentKey: PRODUCT_REVIEWS_NODE_ID,
  };
}

/** Every child, repeat subtrees and empty states included. Used for the
 *  "is it already there / does it already submit" questions, where an author's
 *  placement counts wherever they put it. */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function hasNode(node: BuilderNode, id: string): boolean {
  if (node.id === id) return true;
  return anyChildOf(node).some((child) => hasNode(child, id));
}

/** True when THIS node fires the review-submit action — i.e. it is an authored
 *  Write a Review form. */
export function submitsReview(node: BuilderNode): boolean {
  return (
    node.kind === "element" &&
    (node.events ?? []).some(
      (event) => event.action.kind === "action" && event.action.ref === SUBMIT_ACTION
    )
  );
}

/** `reviews.list`, however the author spaced it. */
function isReviewsRepeat(node: BuilderNode): boolean {
  return node.kind === "repeat" && String(node.source ?? "").trim() === REVIEWS_SOURCE;
}

/**
 * The children we may SEARCH and REWRITE: an element's, and nothing else.
 *
 * Deliberately not `anyChildOf`. A repeat's children are ONE item subtree
 * rendered once per row, so a reviews repeat nested inside another repeat would
 * be a per-row artefact, not the page's review panel — and rebuilding a subtree
 * inside a repeat is how `silverchef-node.ts` once lost its panel from the whole
 * storefront with no error anywhere. Stopping at the repeat boundary is the same
 * rule, for the same reason.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** True when a `reviews.list` repeat is reachable through ELEMENTS from here —
 *  i.e. this tree is the one holding the review panel. */
function hasReviewsRepeat(node: BuilderNode): boolean {
  if (node.kind !== "element") return false;
  const kids = openChildrenOf(node);
  return kids.some((child) => isReviewsRepeat(child) || hasReviewsRepeat(child));
}

/**
 * One rebuild of the subtree: the `reviews.list` repeat becomes the sealed
 * leaf, and any authored submit form is dropped (the leaf carries the form).
 * ELEMENTS ONLY, for the repeat reason in {@link openChildrenOf}.
 */
function rewrite(node: BuilderNode, placed: { done: boolean }): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = openChildrenOf(node);
  if (!kids.length) return node;

  const next: BuilderNode[] = [];
  for (const child of kids) {
    if (isReviewsRepeat(child)) {
      // The FIRST reviews list becomes the panel; a second one (nobody has one)
      // is dropped rather than rendering the panel twice.
      if (!placed.done) {
        placed.done = true;
        next.push(leafNode());
      }
      continue;
    }
    if (submitsReview(child)) continue; // the authored form the leaf replaces
    next.push(rewrite(child, placed));
  }
  return { ...node, children: next };
}

/**
 * The tree with the real review block in it.
 *
 * Returns the SAME tree object when there is nothing to do — the leaf is already
 * placed, or this tree has no reviews repeat at all (most trees: the panel lives in the `product-tabs` master, which
 * is why {@link withReviewsBlockInComponents} exists).
 */
export function withReviewsBlock<T extends NodeTree>(tree: T): T {
  if (!tree || !tree.root) return tree;
  if (hasNode(tree.root, PRODUCT_REVIEWS_NODE_ID)) return tree;
  // The REPEAT is what says "the review panel lives in this tree". Without one
  // there is nothing to anchor on, and a tree that happened to carry a stray
  // submit form must not have it quietly deleted.
  if (!hasReviewsRepeat(tree.root)) return tree;

  return { ...tree, root: rewrite(tree.root, { done: false }) } as T;
}

/**
 * The same pass over the component library.
 *
 * Both live product pages place the tab strip as a `product-tabs` MASTER, so the
 * Reviews panel is not in the page tree at all — it is in the component. Mirrors
 * `guardBuyControlsInComponents`, which had to solve the same problem.
 */
export function withReviewsBlockInComponents<T extends NodeTree>(
  components: Record<string, T>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, tree] of Object.entries(components)) {
    out[key] = tree && (tree as NodeTree).root ? withReviewsBlock(tree) : tree;
  }
  return out;
}
