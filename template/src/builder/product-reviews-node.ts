import type { NodeTree, BuilderNode, NodeCondition } from "@keenan/services/builder";

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
// THE WHOLE REVIEW BLOCK IS REPLACED, NOT JUST THE REPEAT. This is the lesson
// of the first cut of this card, which was rejected for it. Industry Kitchens'
// real `product-reviews` master (read off production, and pinned as a fixture
// in the test beside this file) is FOUR siblings under one wrapper:
//
//     #d9wyv  div                                    <- the block
//       #i3xwv  div   cond: reviews.list[0]          <- the list, GATED
//         #8grt6 repeat  source: reviews.list
//       #5sxmp  p     cond: !reviews.list[0]         "Be the first to review this product!"
//       #nazol  div   cond: @state.submit.ok         "Thank you for your review! …"
//       #y487d  div   cond: !@state.submit.ok        <- Write a Review heading + form
//
// Substituting the leaf where the REPEAT sits buries it inside `#i3xwv` and it
// inherits `cond: reviews.list[0]` — so on every product with no approved
// review (which is every product on Industry Kitchens but one) the panel and
// the form vanish and the authored empty state is all that is left. So the
// anchor is the highest ancestor GATED ON `reviews.list`, and the siblings that
// belonged to the block go with it: the authored empty state, the thank-you
// panel and the form wrapper. What is NOT part of the block — the tab-panel
// wrapper on Chefs Depot, gated on `@state.tab == 3` — is untouched, because
// that gate is the tab strip's, not the review list's.
//
// AN AUTHORED FORM IS REPLACED TOO, and that is deliberate. Industry Kitchens
// authored its own version of this block — the same fields the old
// ProductTabs form had, node-ified: "Your Name", "Title (optional)", a rating
// with no measure named, and no spam trap. Leaving it would mean the two
// storefronts ask for different things and, worse, that IK's form calls a
// title optional while the action now requires one (Zoey requires it, and the
// card matches Zoey's fields exactly). Nothing is written back, so an author
// who re-authors the panel gets it back on the next publish.
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
 *  "is it already there" question, where an author's placement counts wherever
 *  they put it. */
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

/** True when this node's own condition gates it on the REVIEW LIST — the gate
 *  the sealed panel must never inherit, because the panel renders its own empty
 *  state and its own form and has to appear whether or not a review exists. */
function gatedOnReviews(node: BuilderNode): boolean {
  const condition = node.condition as NodeCondition | undefined;
  if (!condition) return false;
  if (condition.kind === "expr") return String(condition.source ?? "").includes(REVIEWS_SOURCE);
  if (condition.kind === "data") return String(condition.path ?? "").includes(REVIEWS_SOURCE);
  return false;
}

/**
 * The STATUS NAMESPACES the authored review form writes.
 *
 * A form fires `submitReview` with `status: "submit"`, and the renderer then
 * writes `submit.pending`, `submit.ok`, `submit.error`, `submit.field.<input>`.
 * The block's thank-you panel and its form wrapper are conditioned on those, so
 * reading the namespace off the form itself is what lets us recognise them
 * without hardcoding one channel's chosen name.
 */
function submitStatusNames(node: BuilderNode, out: Set<string>): Set<string> {
  if (node.kind === "element") {
    for (const event of node.events ?? []) {
      const action = event.action;
      if (action.kind === "action" && action.ref === SUBMIT_ACTION && action.status) {
        out.add(String(action.status));
      }
    }
  }
  for (const child of openChildrenOf(node)) submitStatusNames(child, out);
  return out;
}

function gatedOnSubmitStatus(node: BuilderNode, statuses: Set<string>): boolean {
  const condition = node.condition as NodeCondition | undefined;
  if (!condition || condition.kind !== "state") return false;
  const ref = String(condition.ref ?? "");
  for (const status of statuses) {
    if (ref === status || ref.startsWith(`${status}.`)) return true;
  }
  return false;
}

/** True when a `submitReview` form is reachable through ELEMENTS from here. */
function containsSubmitForm(node: BuilderNode): boolean {
  if (submitsReview(node)) return true;
  return openChildrenOf(node).some(containsSubmitForm);
}

/**
 * The path of ELEMENTS from `node` down to the first `reviews.list` repeat,
 * ending with the repeat itself. Null when this subtree holds no review list.
 */
function pathToReviewsRepeat(node: BuilderNode): BuilderNode[] | null {
  if (node.kind !== "element") return null;
  for (const child of openChildrenOf(node)) {
    if (isReviewsRepeat(child)) return [node, child];
    const deeper = pathToReviewsRepeat(child);
    if (deeper) return [node, ...deeper];
  }
  return null;
}

/**
 * A sibling of the anchor that belonged to the REVIEW BLOCK and must go with
 * it: the authored empty state (`!reviews.list[0]`), the thank-you panel and
 * the form wrapper (`@state.submit.*`), and anything holding the form itself.
 *
 * Scope is deliberately narrow — only the anchor's own siblings are judged, so
 * a tab panel or a page section can never be swept away by this test.
 */
function belongsToReviewBlock(node: BuilderNode, statuses: Set<string>): boolean {
  return (
    isReviewsRepeat(node) ||
    gatedOnReviews(node) ||
    gatedOnSubmitStatus(node, statuses) ||
    containsSubmitForm(node)
  );
}

/** Replace `target` (by identity) with the sealed leaf, dropping every sibling
 *  that belonged to the review block. Returns null when `target` is not a child
 *  anywhere below `node`. */
function replaceBlock(
  node: BuilderNode,
  target: BuilderNode,
  statuses: Set<string>
): BuilderNode | null {
  if (node.kind !== "element") return null;
  const kids = openChildrenOf(node);
  if (!kids.length) return null;

  const index = kids.indexOf(target);
  if (index >= 0) {
    const next: BuilderNode[] = [];
    for (let i = 0; i < kids.length; i++) {
      if (i === index) {
        next.push(leafNode());
        continue;
      }
      if (belongsToReviewBlock(kids[i], statuses)) continue;
      next.push(kids[i]);
    }
    return { ...node, children: next };
  }

  for (let i = 0; i < kids.length; i++) {
    const rebuilt = replaceBlock(kids[i], target, statuses);
    if (rebuilt) {
      const next = [...kids];
      next[i] = rebuilt;
      return { ...node, children: next };
    }
  }
  return null;
}

/**
 * A last sweep for a stray `submitReview` form left somewhere else in the tree
 * — the leaf carries the only form either site may show, and two forms on one
 * page would post two different field sets. Narrow on purpose: an element is
 * dropped only when IT fires the action, or when its own condition is one of
 * the form's status conditions. Nothing is dropped for merely containing a form
 * at this stage; the anchor's siblings already handled the authored block, and
 * a wide test here could swallow a page section.
 */
function dropStraySubmitNodes(node: BuilderNode, statuses: Set<string>): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = openChildrenOf(node);
  if (!kids.length) return node;
  const next: BuilderNode[] = [];
  for (const child of kids) {
    if (submitsReview(child) || gatedOnSubmitStatus(child, statuses)) continue;
    next.push(dropStraySubmitNodes(child, statuses));
  }
  return { ...node, children: next };
}

/**
 * The tree with the real review block in it.
 *
 * Returns the SAME tree object when there is nothing to do — the leaf is already
 * placed, or this tree has no reviews repeat at all (most trees: the panel lives
 * in the `product-tabs` master, which is why {@link withReviewsBlockInComponents}
 * exists).
 */
export function withReviewsBlock<T extends NodeTree>(tree: T): T {
  if (!tree || !tree.root) return tree;
  if (hasNode(tree.root, PRODUCT_REVIEWS_NODE_ID)) return tree;

  // The REPEAT is what says "the review panel lives in this tree". Without one
  // there is nothing to anchor on, and a tree that happened to carry a stray
  // submit form must not have it quietly deleted.
  const path = pathToReviewsRepeat(tree.root);
  if (!path) return tree;

  const statuses = submitStatusNames(tree.root, new Set<string>());

  // The ANCHOR is the highest node on that path gated on `reviews.list` — the
  // gate the sealed panel must not inherit. Falling back to the repeat itself
  // when nothing on the path is gated (Chefs Depot: the repeat sits directly in
  // the tab panel, whose only condition is the tab index).
  const anchor = path.find((node) => gatedOnReviews(node)) ?? path[path.length - 1];

  // Degenerate: the whole tree IS the gated block. Keep the root element (a
  // NodeTree must have one), drop its gate, and let the leaf be its only child.
  if (anchor === tree.root) {
    const { condition: _dropped, ...rest } = tree.root as BuilderNode & {
      condition?: NodeCondition;
    };
    return { ...tree, root: { ...rest, children: [leafNode()] } as BuilderNode } as T;
  }

  const replaced = replaceBlock(tree.root, anchor, statuses);
  if (!replaced) return tree;

  return { ...tree, root: dropStraySubmitNodes(replaced, statuses) } as T;
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
