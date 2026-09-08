import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// FINISHING the "images are illustrative" banner on Chefs Depot's Modular
// Systems products (card qGfWAzQx, Steve — CE-40, 26 August meeting).
//
// WHAT WAS ALREADY THERE. Chefs Depot's published product template (channel 2,
// page 71) carries a hand-authored paragraph reading "IMAGES ARE FOR
// ILLUSTRATIVE PURPOSES ONLY.  REFER TO SPEC SHEETS", conditioned on
// `"modular-systems" in product.slug`. It is unfinished in two ways that are
// only visible on the live site:
//
//   1. EVERY style on it is an `lg:` variant, so below 1024px the shopper gets
//      plain 14px black text with no panel at all.
//   2. `lg:font-[Arial,_sans-serif]` compiles to a BROKEN selector when the
//      portal scopes the channel's authored CSS (the comma inside the arbitrary
//      value splits the selector), so the font it asks for never applies.
//
// Both are the trap `docs/behaviour/catalogue.md` > sf-product-page records:
// "classes used in a stored tree must already exist in the deployed
// stylesheet". A stored tree is DATA; it renders against whatever CSS is live.
//
// WHY CODE AND NOT AUTHORING. Same reason as the SilverChef panel (6f47rFeT),
// the kit block (7bmpuqei) and the per-product image notice (82HgV23q): this
// page renders from an AUTHORED node tree stored in the database, so a panel
// whose colour has to be right cannot be expressed in stored classes. This pass
// SWAPS the half-finished paragraph for the sealed native, whose styling
// compiles with the site build and therefore cannot render unstyled. The
// author's PLACEMENT is preserved exactly — the leaf goes where the paragraph
// was — because that is where Tim and Chris put it.
//
// PURE. Nothing is written back to the stored tree, so a rollback has nothing
// to undo and the Site Builder canvas still shows what the author authored.
//
// FAILS SAFE. The match requires BOTH the illustrative wording and a condition
// naming modular. Re-author either and this pass simply no-ops, leaving the
// author's own node to render as they wrote it — never a blank space.
// ============================================================================

/** The node id and native key. `product-natives` registers the leaf under this key. */
export const MODULAR_NOTICE_NODE_ID = "product-modular-notice";

/**
 * The banner's copy, exactly as the card gives it. Rendered uppercase by the
 * panel's own styling (as the live authored paragraph already is), so the
 * sentence a screen reader or a copy-paste gets is this one.
 */
export const MODULAR_NOTICE_TEXT =
  "Images are for illustrative purposes only. Refer to spec sheets.";

/**
 * The card's rule: show when the product slug names the Modular Systems range.
 *
 * Matched on a normalised slug (lower-cased, every run of non-alphanumerics
 * folded to one space) so a hyphenated slug, a spaced one and a slug that only
 * carries the phrase in the middle all read the same.
 *
 * THE TRAILING "s" IS OPTIONAL, and that is a decision rather than a typo. The
 * range is slugged both ways in the catalogue — measured on production
 * 2026-09-07: 326 slugs say `modular-systems-…` and another 157 say
 * `modular-system-…` for the same benches, undershelves and leg braces
 * (`modular-system-swbd10-1200-workbench-with-3-drawer-each-side` beside
 * `modular-systems-swbd10-1800-workbench-with-4-drawer-each-side`). Reading the
 * card's phrase literally would leave 157 pages of one range without the notice,
 * which is not what "show it on modular systems" means to anyone reading it.
 *
 * "not on combi ovens" comes out of the phrase needing BOTH words: the only
 * combi-oven slugs carrying "modular" at all are the two Rational
 * `…-modular-stand-…-combi-ovens` accessories, which have no "system" in them.
 * Verified against production 2026-09-07: 0 slugs match this rule AND contain
 * "combi".
 */
export function slugIsModularSystems(slug: unknown): boolean {
  if (typeof slug !== "string" || slug.length === 0) return false;
  return / modular systems? /.test(` ${slug.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `);
}

function noticeNode(): BuilderNode {
  return { id: MODULAR_NOTICE_NODE_ID, kind: "component", componentKey: MODULAR_NOTICE_NODE_ID };
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

/** The static words an element node writes out, joined. Bindings contribute nothing. */
function staticTextOf(node: BuilderNode): string {
  if (node.kind !== "element" || !Array.isArray(node.text)) return "";
  return node.text
    .map((part) => (part && part.kind === "static" ? String(part.value ?? "") : ""))
    .join(" ");
}

/** The source of an expression condition, or "" for a node with no condition. */
function conditionSourceOf(node: BuilderNode): string {
  const condition = node.condition;
  return condition && condition.kind === "expr" ? condition.source : "";
}

/**
 * True for the half-finished authored banner: it says the illustrative
 * sentence, and its own condition is the modular rule. Both halves are required
 * — the per-product banner (82HgV23q) carries the same sentence with no
 * condition at all, and must never be swallowed by this pass.
 */
function isUnfinishedModularBanner(node: BuilderNode): boolean {
  if (node.kind !== "element") return false;
  if (!/images\s+are\s+for\s+illustrative\s+purposes\s+only/i.test(staticTextOf(node))) return false;
  return /modular/i.test(conditionSourceOf(node));
}

/** Copy of `node` with every unfinished modular banner under it swapped for the leaf. */
function swap(node: BuilderNode): BuilderNode {
  if (isUnfinishedModularBanner(node)) return noticeNode();
  if (node.kind === "element") {
    const kids = node.children;
    if (!kids || kids.length === 0) return node;
    const next = kids.map(swap);
    return next.every((child, i) => child === kids[i]) ? node : { ...node, children: next };
  }
  if (node.kind === "repeat") {
    const kids = node.children ?? [];
    const empties = node.emptyChildren ?? [];
    const nextKids = kids.map(swap);
    const nextEmpties = empties.map(swap);
    const same =
      nextKids.every((child, i) => child === kids[i]) &&
      nextEmpties.every((child, i) => child === empties[i]);
    return same ? node : { ...node, children: nextKids, emptyChildren: nextEmpties };
  }
  return node;
}

/**
 * The product tree with the finished Modular Systems banner in place of the
 * half-finished authored one.
 *
 * Returns the SAME tree object when there is nothing to swap (every other
 * product template on both sites) so the common path allocates nothing.
 */
export function withModularNoticeNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, MODULAR_NOTICE_NODE_ID)) return tree;
  const root = swap(tree.root);
  return root === tree.root ? tree : { ...tree, root };
}
