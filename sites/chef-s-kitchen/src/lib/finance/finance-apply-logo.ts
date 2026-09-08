import type { BuilderNode, ElementNode, NodeTree } from "@keenan/services/builder";
import { FINANCE_APPLY_SLUGS, type FinanceApplyFunder } from "@keenan/services/finance";

// ============================================================================
// The FINANCIER'S OWN LOGO on the finance application page (card XlDVUsuC).
//
// Steve: put the SilverChef logo on `/silverchef/apply` and the Skope Funding
// logo on `/skope-funding/apply`, on both storefronts. The two files are the
// ones attached to that card; they live in `public/finance/` on every site.
//
// WHY CODE AND NOT AUTHORING. Since 2026-08-25 both apply pages resolve to
// staff-editable CMS pages: the coded routes seed a draft and 307 to
// `/pages/silverchef-apply` / `/pages/skope-funding-apply` once published,
// which is what all four live pages do today. So editing the coded page body
// alone ships nothing a customer sees, and the seed tree only reaches a page
// that does not exist yet (seeding is create-only, precisely so a deploy can
// never overwrite a staff edit). A mark that has to appear on FOUR pages can
// therefore only arrive two ways — somebody hand-edits four stored trees in
// the Site Builder, or the branch places the node at render time. This is the
// second, exactly as the product page's finance panel does it
// (`builder/silverchef-node.ts`, card 6f47rFeT): nothing is written to a stored
// tree, so there is no content to roll back and no staff edit to lose.
//
// IDEMPOTENT, AND THE AUTHOR WINS. A tree that already carries this node id, or
// an <img> that already NAMES THIS FINANCIER, is returned untouched — the page
// never ends up with two logos. That is not hypothetical: Chefs Depot's
// SilverChef page already carries a full-width `silverchef-logo.png` somebody
// placed in the page editor (it is the image card HPgTV0Ck had to allow through
// the optimiser), so that page keeps THEIR logo and the other three get this
// one. The test is the funder's own name in the image's `src` or `alt`, which
// is what a hand-placed mark looks like; a logo uploaded under an opaque asset
// id with no alt text cannot be recognised, and staff would then delete one of
// the two in the editor.
//
// THE OTHER FINANCIER'S MARK IS NEVER SHOWN (Steve, 2026-08-20, recorded on
// the page itself): a customer may never be handed to the wrong financier. The
// funder is resolved from the page's own slug through `FINANCE_APPLY_SLUGS`,
// the same constant the routes redirect through, and an unknown slug gets NO
// logo rather than a default one.
//
// PURE. Never mutates the tree it is given — the route caches that object and
// the portal designer reads the same one.
// ============================================================================

/** The node id the injected logo carries. An author who places a node with
 *  this id in the Site Builder gets THEIR placement. */
export const FINANCE_APPLY_LOGO_NODE_ID = "finance-apply-logo";

export interface FinanceApplyLogo {
  /** Served from each site's own `public/finance/` — a relative path, so the
   *  image loader passes it straight through unoptimised (`lib/image-loader`). */
  src: string;
  /** Names the financier, per the card. */
  alt: string;
  width: number;
  height: number;
}

/** The two marks, from the files attached to card XlDVUsuC. Intrinsic sizes are
 *  the files' own, so the masthead never distorts them. */
export const FINANCE_APPLY_LOGOS: Record<FinanceApplyFunder, FinanceApplyLogo> = {
  silverchef: { src: "/finance/silverchef.jpg", alt: "SilverChef", width: 1040, height: 502 },
  skope: { src: "/finance/skope-funding.jpg", alt: "Skope Funding", width: 372, height: 104 },
};

/** One masthead size for both paths (the coded page and the CMS tree), so the
 *  two renderings of the same page cannot drift. Height-led: the two files have
 *  very different aspect ratios. */
export const FINANCE_APPLY_LOGO_CLASSES = ["mb-4", "h-14", "w-auto", "max-w-[240px]", "object-contain"];

/**
 * Which financier's page this is, from the CMS slug — or null when the slug is
 * not an apply page at all (every other content page, which must gain nothing).
 */
export function financeApplyFunderForSlug(slug: string): FinanceApplyFunder | null {
  const found = (Object.keys(FINANCE_APPLY_SLUGS) as FinanceApplyFunder[]).find(
    (funder) => FINANCE_APPLY_SLUGS[funder] === slug
  );
  return found ?? null;
}

/** The logo as a builder element node. */
function logoNode(funder: FinanceApplyFunder): ElementNode {
  const logo = FINANCE_APPLY_LOGOS[funder];
  return {
    id: FINANCE_APPLY_LOGO_NODE_ID,
    kind: "element",
    tag: "img",
    classes: [...FINANCE_APPLY_LOGO_CLASSES],
    attrs: {
      src: { kind: "static", value: logo.src },
      alt: { kind: "static", value: logo.alt },
      width: { kind: "static", value: String(logo.width) },
      height: { kind: "static", value: String(logo.height) },
    },
  };
}

/** Every child, repeat subtrees included — used only to ASK questions of the
 *  tree ("is a logo already in here"), never to insert. */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function someNode(node: BuilderNode, match: (n: BuilderNode) => boolean): boolean {
  if (match(node)) return true;
  return anyChildOf(node).some((child) => someNode(child, match));
}

/** How a hand-placed mark for each financier is recognised, in an image's `src`
 *  or `alt`. Deliberately per-funder: the other financier's picture on this
 *  page is a fault to see, not a reason to withhold this page's own mark. */
const FUNDER_IMAGE_WORDS: Record<FinanceApplyFunder, string> = {
  silverchef: "silverchef",
  skope: "skope",
};

/** Does this node already show THIS financier's mark? */
function showsFunder(node: BuilderNode, funder: FinanceApplyFunder): boolean {
  if (node.kind !== "element" || node.tag !== "img") return false;
  const word = FUNDER_IMAGE_WORDS[funder];
  return [node.attrs?.src, node.attrs?.alt].some(
    (attr) => attr?.kind === "static" && attr.value.toLowerCase().includes(word)
  );
}

/** Children we may search and insert into: an element's, and nothing else — a
 *  repeat's children are one item subtree rendered many times. */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** Depth-first through ELEMENTS ONLY: rebuild the first element matching
 *  `match` with `place` applied to its children. Null when nothing matched. */
function rebuildAt(
  node: BuilderNode,
  match: (n: BuilderNode) => boolean,
  place: (kids: BuilderNode[]) => BuilderNode[]
): BuilderNode | null {
  if (node.kind !== "element") return null;
  if (match(node)) return { ...node, children: place(openChildrenOf(node)) };
  const kids = openChildrenOf(node);
  for (let i = 0; i < kids.length; i++) {
    const rebuilt = rebuildAt(kids[i], match, place);
    if (rebuilt) {
      const next = [...kids];
      next[i] = rebuilt;
      return { ...node, children: next };
    }
  }
  return null;
}

const isTag = (tag: string) => (n: BuilderNode) => n.kind === "element" && n.tag === tag;

/**
 * The apply page's tree with that financier's masthead above its heading.
 *
 * Anchors, in order: the top of the page's `<header>` (what the seeded tree
 * carries, so the logo sits directly above the H1); else the top of whatever
 * element holds the H1; else the top of the root. A page staff have reshaped
 * still gets its logo rather than silently losing it.
 */
export function withFinanceApplyLogo(tree: NodeTree, funder: FinanceApplyFunder): NodeTree {
  const already = someNode(
    tree.root,
    (n) => n.id === FINANCE_APPLY_LOGO_NODE_ID || showsFunder(n, funder)
  );
  if (already) return tree;

  const prepend = (kids: BuilderNode[]) => [logoNode(funder), ...kids];
  const placed =
    rebuildAt(tree.root, isTag("header"), prepend) ??
    rebuildAt(tree.root, (n) => openChildrenOf(n).some(isTag("h1")), prepend);
  if (placed) return { ...tree, root: placed };

  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: prepend(openChildrenOf(tree.root)) } };
  }
  return tree;
}
