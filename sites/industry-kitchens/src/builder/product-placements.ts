import type { NodeTree } from "@keenan/services/builder";
import { withSilverChefNode } from "./silverchef-node";
import { withItemIdNode } from "./item-id-node";
import { withAddonsNode } from "./product-addons-node";
import { withProductKitNode } from "./product-kit-node";
import { withProductInstructionsNode } from "./product-instructions-node";
import { withImageNoticeNode } from "./product-image-notice";
import { withCombinationNoticeNode } from "./product-combination-notice";
import { withReviewsBlock } from "./product-reviews-node";
import { withResidentialNoticeNode } from "./product-residential-notice";
import { withPackNoteNode } from "./product-pack-note";
import { withModularNoticeNode } from "./modular-notice";
import { withUpsellBlock } from "./upsell-node";
import { withCdMemberPricingNode } from "./cd-member-pricing-node";

// ============================================================================
// The product page's PLACEMENT passes, in one place, and which of them a site
// has handed over to its stored template.
//
// Each pass below puts a sealed leaf (or a cloned block) into the stored product
// tree at render time when the tree does not carry it — "insert if missing". That
// was how a panel reached every product page on both sites without anyone
// hand-editing two stored trees. Its cost (IK hidden-conditionals audit,
// 2026-09-29): the rule deciding where the panel goes and when it shows lived in
// code, so an author could neither see it nor remove the panel — delete the node
// in the CMS and the pass put it straight back.
//
// A stored template that now AUTHORS a placement — the node sits in the tree with
// its own Show-if expression, visible and editable in the CMS — says so on its ROOT
// element, in the attribute `data-kg-template-owns`: a space-separated list of the
// placement names below (e.g. "image-notice addons kit"). A placement named there
// is not inserted by code at all: the template is its only owner, and an author
// who deletes the node has deleted it. The declaration is itself template data —
// the Designer's attribute list shows it and can change it — so which panels code
// may still place is decided in the CMS too. A tree that declares nothing (Chefs
// Depot's, and the SEED tree) keeps every pass, exactly as before.
//
// ORDER IS UNCHANGED from the nested calls this replaced in `product-node-branch.tsx`.
// FIVE passes share the `actions-row` anchor and each one inserts BEFORE it, so
// whichever runs LAST ends up nearest the buy buttons. The order is decided, not
// accidental:
//   * the UNMADE-COMBINATION sentence (card VNh9DdYd) is outermost, and therefore the
//     very last thing before the buttons — it explains a DEAD button, so nothing may
//     come between the two. CXnP1lrL took away every availability string that used to
//     explain one (`sf-product-page`).
//   * the PRICED EXTRAS (0CDcCYmO) come next: ticking one changes what Add to Cart
//     will charge, and a priced control belongs beside the button it moves.
//   * the free-text INSTRUCTIONS box (kyMjCmAw) sits above them — it describes what to
//     build and moves no money, so the priced control keeps the nearer place.
//   * the KIT CONTENTS (the sealed `product-kit` native, card 7bmpuqei) sit below the
//     pack note: what a bundle holds, and for a bundle the picks its own Add to Quote
//     carries. Renders null for a product that is not a kit.
//   * the PACK NOTE (O108e4jH / zeMPVcA3) is innermost: a fact about the price, which
//     belongs with the price panel.
// Page order is therefore price -> pack sentence -> kit contents -> Instructions ->
// extras -> "we do not make that combination" -> buy row. `ProductDetail.tsx` (the
// non-node fallback renderer) is hand-ordered to match, and if any of these anchors
// moves they all move together (catalogue.md `sf-product-page`). A site that authors
// these nodes in its template owns that order itself.
// ============================================================================

/** One placement pass, named for what it places. */
export type ProductPlacement =
  | "item-id"
  | "silverchef-panel"
  | "image-notice"
  | "reviews-panel"
  | "modular-notice"
  | "pack-note"
  | "kit"
  | "instructions"
  | "addons"
  | "residential-notice"
  | "combination-notice"
  | "upsell-rail"
  | "cd-member-pricing"
  | "compare";

type Pass = (tree: NodeTree) => NodeTree;

/** Innermost first — the order the passes wrap each other in. */
const PASSES: readonly (readonly [ProductPlacement, Pass])[] = [
  ["item-id", withItemIdNode],
  ["silverchef-panel", withSilverChefNode],
  ["image-notice", withImageNoticeNode],
  ["reviews-panel", withReviewsBlock],
  ["modular-notice", withModularNoticeNode],
  ["pack-note", withPackNoteNode],
  ["kit", withProductKitNode],
  ["instructions", withProductInstructionsNode],
  ["addons", withAddonsNode],
  ["residential-notice", withResidentialNoticeNode],
  ["combination-notice", withCombinationNoticeNode],
  ["upsell-rail", withUpsellBlock],
  ["cd-member-pricing", withCdMemberPricingNode],
];

/** The root attribute a stored template declares its own placements in. */
export const TEMPLATE_OWNS_ATTR = "data-kg-template-owns";

const KNOWN: ReadonlySet<string> = new Set<ProductPlacement>([
  ...PASSES.map(([name]) => name),
  "compare",
]);

/**
 * The placements this tree declares it authors itself — read from its root's
 * `data-kg-template-owns` attribute (a STATIC value; anything else declares nothing).
 * Unknown names are ignored, so a typo can never switch off a pass it does not name.
 */
export function templateOwnedPlacements(tree: NodeTree | null | undefined): ReadonlySet<ProductPlacement> {
  const root = tree?.root;
  if (!root || root.kind !== "element") return new Set();
  const attr = root.attrs?.[TEMPLATE_OWNS_ATTR];
  if (!attr || attr.kind !== "static" || typeof attr.value !== "string") return new Set();
  return new Set(
    attr.value
      .split(/[\s,]+/)
      .map((name) => name.trim())
      .filter((name): name is ProductPlacement => KNOWN.has(name))
  );
}

/**
 * The product tree with every placement pass applied EXCEPT the ones the tree
 * declares it authors itself. Pure: returns the same tree object when nothing
 * was placed.
 */
export function composeProductPlacements(tree: NodeTree): NodeTree {
  const owned = templateOwnedPlacements(tree);
  let out = tree;
  for (const [name, pass] of PASSES) {
    if (owned.has(name)) continue;
    out = pass(out);
  }
  return out;
}

/** True when `name`'s pass should run on this tree (the compare pass runs later, in the branch). */
export function placementPassRuns(tree: NodeTree, name: ProductPlacement): boolean {
  return !templateOwnedPlacements(tree).has(name);
}
