import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Card TnQJpunl — "Remove background image from behind header on Chefs Depot".
//
// Steve, 2026-08-26, with a screenshot of a Chefs Depot category page:
//   "We don't need the category feature image to also be stretched and made the
//    background image behind the site header. Please just the main green site
//    colour, no image."
//
// The banner section already carries `bg-gradient-to-br from-brand-mid
// to-brand-deep`, so dropping the backdrop leaves exactly the brand green Steve
// asked for. The breadcrumb, the H1, the description and the count pill are
// untouched and keep their white-on-green treatment.
//
// WHY A RENDER-TIME PASS AND NOT ONLY A SOURCE EDIT
// -------------------------------------------------
// Chefs Depot's category page does NOT render from `app/categories/[slug]/
// page.tsx` any more. `node_category_template_enabled` is TRUE on channel 2 and
// `cms_pages` row 72 (`__template-category`) holds a published Site Builder node
// tree, so `renderCategoryNodeBranch` owns the page — verified in the live HTML
// of https://chefsdepot.com.au/categories/bain-maries-and-food-warmers, which
// serves `<div data-kg-nodes>` with `<img data-node-id="img-cf1"
// class="object-cover opacity-30 …">`. Deleting the JSX from the legacy route
// (done, in the same change) would therefore have changed nothing a shopper
// sees. The backdrop is AUTHORED DATA, and this is the pure pass that removes it
// on the way to the renderer.
//
// Same shape and the same reason as `strip-stock-nodes.ts`, with one deliberate
// difference: that card's cleanup was a one-off script that rewrote the stored
// trees, this one runs at RENDER time (the `product-image-notice.ts` pattern).
// Nothing is written to the stored trees, so there is nothing to undo on a
// rollback, an author who re-adds the node in the designer still does not put it
// back on the storefront, and the removal cannot be lost to a republish.
//
// SCOPE — this is a Chefs Depot ask, and it lands only there BY THE DATA, not by
// a channel check. `builder/category-node-branch.tsx` is a shared module
// (`orchestrator/shared-modules.json`, drift = build failure), so the call sits
// in both forks. Measured against production 2026-09-03: channel 1 (Industry
// Kitchens) `category_layout` tree contains neither `banner-bg` nor any
// `category.image_url` binding — IK's banner was authored clean — so the pass is
// a verified no-op there and returns `removed: []`. If IK ever authors a banner
// backdrop of its own it would be stripped too; say so out loud before adding
// one rather than discovering it.
// ============================================================================

/**
 * The two nodes the Chefs Depot banner backdrop is made of, as they sit in the
 * stored tree today:
 *
 * - `img-cf1`  — label `banner-bg`, `<img>` bound to `category.image_url`,
 *                classes `object-cover opacity-30 absolute inset-0 h-full
 *                w-full`, conditioned on `category.image_url`.
 * - `div-cf2`  — label `banner-overlay`, the gradient scrim
 *                `absolute inset-0 bg-gradient-to-r from-brand-deep/80
 *                to-brand-deep/40`, same condition.
 *
 * The scrim goes WITH the image and never on its own: it exists to darken the
 * photo so white text stays readable over it, and left behind it would simply
 * repaint a flat panel of `brand-deep` over the left of the brand-green banner —
 * a visible change to the colour Steve asked to be left alone.
 */
export const BANNER_BACKDROP_NODE_IDS = ["img-cf1", "div-cf2"] as const;

/**
 * Ids are exact but they are not the whole story: a designer who deletes and
 * re-adds the backdrop gets a fresh generated id, and the ids above mean nothing
 * on a site forked later. The LABEL is what an author actually names the thing
 * and what the node panel shows, so it is matched too.
 */
export const BANNER_BACKDROP_LABELS = ["banner-bg", "banner-overlay"] as const;

/** Copy of a tree with the banner backdrop removed, plus what was removed. */
export interface BannerBackdropResult {
  tree: NodeTree;
  /** Ids actually found and dropped, in tree order. Empty = already clean. */
  removed: string[];
}

// The walk is structural, not variant-aware, for the reason `strip-stock-nodes`
// spells out: `BuilderNode` is a union whose members differ in which child
// arrays they carry, so the transform reads them off a plain-record view and
// only the two node-list keys the builder uses are ever rewritten. Everything
// else — component instances, styles, bindings, conditions — is copied through
// byte for byte.
type NodeRecord = Record<string, unknown> & { id?: unknown; label?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function shouldRemove(node: NodeRecord, doomedIds: Set<string>, doomedLabels: Set<string>): boolean {
  if (typeof node.id === "string" && doomedIds.has(node.id)) return true;
  return typeof node.label === "string" && doomedLabels.has(node.label);
}

function stripNode(
  node: NodeRecord,
  doomedIds: Set<string>,
  doomedLabels: Set<string>,
  removed: string[]
): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const kept: NodeRecord[] = [];
    for (const child of kids as NodeRecord[]) {
      if (child && typeof child === "object" && shouldRemove(child, doomedIds, doomedLabels)) {
        removed.push(typeof child.id === "string" ? child.id : "(unnamed)");
        continue;
      }
      kept.push(stripNode(child, doomedIds, doomedLabels, removed));
    }
    next[key] = kept;
  }
  return next;
}

/**
 * Remove the stretched category-image backdrop and its scrim from a stored
 * category-layout tree.
 *
 * Pure and idempotent: a tree that never had them (Industry Kitchens') comes
 * back untouched with `removed: []`, and running it twice is the same as running
 * it once, so it is safe on every request.
 *
 * The root is never considered — it is the page wrapper — matching how the
 * backdrop is nested inside the `banner` section.
 */
export function stripCategoryBannerBackdrop(
  tree: NodeTree,
  ids: readonly string[] = BANNER_BACKDROP_NODE_IDS,
  labels: readonly string[] = BANNER_BACKDROP_LABELS
): BannerBackdropResult {
  const removed: string[] = [];
  const root = stripNode(
    tree.root as unknown as NodeRecord,
    new Set(ids),
    new Set(labels),
    removed
  );
  return { tree: { ...tree, root: root as unknown as BuilderNode } as NodeTree, removed };
}

/**
 * The post-condition, called on every render by `renderCategoryNodeBranch`
 * straight after the strip: does any node left in the tree still stretch the
 * category feature image across the banner? Id and label matching is the
 * mechanism; "nothing paints `category.image_url` behind the header" is the
 * actual acceptance criterion, and an author who rebuilt the backdrop under
 * another name would defeat both. This is what turns that into a warning in the
 * logs instead of a silent return of the photograph.
 *
 * A node counts only when it BOTH binds `category.image_url` and is positioned
 * as a full-bleed backdrop (`absolute` + `inset-0`) — the subcategory tiles and
 * the `/categories` index bind the very same field for a legitimate, in-flow
 * picture, and this must never report those.
 */
export function findBannerBackdropNodes(tree: NodeTree): string[] {
  const found: string[] = [];
  const visit = (node: NodeRecord) => {
    const classes = node.classes;
    const isBackdrop =
      Array.isArray(classes) && classes.includes("absolute") && classes.includes("inset-0");
    if (isBackdrop && JSON.stringify(node.attrs ?? {}).includes("category.image_url")) {
      found.push(typeof node.id === "string" ? node.id : "(unnamed)");
    }
    for (const key of CHILD_KEYS) {
      const kids = node[key];
      if (Array.isArray(kids)) for (const child of kids as NodeRecord[]) if (child) visit(child);
    }
  };
  visit(tree.root as unknown as NodeRecord);
  return found;
}
