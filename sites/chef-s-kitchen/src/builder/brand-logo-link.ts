import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Card uzeXShZu — "Brand Info - Front End".
//
// The product page links back to the brand's page with the brand's LOGO — an
// image, no text block, the link marked `rel="nofollow"`, and an ALT tag
// (Tim, 2026-08-11). Fiona's report was that the new product page shows only
// the brand's name in small letters where the old Industry Kitchens page showed
// the brand's logo.
//
// Same shape as `strip-stock-nodes.ts`, and for the same reason: the storefront
// renders the AUTHORED tree out of the database (`cms_pages.node_tree` for a
// draft read, `cms_page_versions.node_tree` of the published version for a live
// one), and `SEED_PRODUCT_TREE` is only the fallback for a site that never
// authored one. Editing the seed alone changes nothing a customer can see, so
// the rule lives here — pure and testable — and `scripts/brand-logo-link.mts`
// applies it to the stored trees.
//
// Everything the node binds already exists on the product payload
// (`enrichProductPayload`): `brand.imageUrl` (brands.image_url), `brand.href`
// (/brands/<slug>) and `brand.name`. No services change is needed.
// ============================================================================

/** The anchor's node id — also the idempotency marker for the runner. */
export const BRAND_LOGO_LINK_ID = "brand-logo-link";
export const BRAND_LOGO_IMG_ID = "brand-logo-img";

/**
 * The plain-text brand line the seed put above the product title ("TABLEKRAFT").
 * When a brand HAS a logo the logo replaces it; when it has none (6 of 418
 * brands on 2026-08-13) the text stays, so a brandless-looking page is never the
 * result of this change.
 */
export const BRAND_EYEBROW_ID = "brand-eyebrow";

/** Shown only when the brand has both a logo and a page to link to. */
export const LOGO_CONDITION = "brand.imageUrl && brand.href";
/** The text eyebrow becomes the no-logo fallback. */
export const EYEBROW_FALLBACK_CONDITION = "brand.name && !brand.imageUrl";

/**
 * The brand-logo link node.
 *
 * - `rel="nofollow"` — Tim's call; the same logo repeats on every product of the
 *   brand, so the link is navigation for people, not a crawl signal.
 * - `alt` binds the brand NAME (not "… logo"): the image is the whole content of
 *   the link, so its alt text becomes the link's accessible name, and a screen
 *   reader should hear "Tablekraft, link".
 * - `width`/`height` are the real asset ratio (brand logos are normalised to
 *   600×300), so the box is reserved before the image loads; the CSS height +
 *   `w-auto` is what actually sizes it.
 */
export function brandLogoLinkNode(): BuilderNode {
  return {
    id: BRAND_LOGO_LINK_ID,
    kind: "element",
    tag: "a",
    label: "Brand logo → brand page",
    condition: { kind: "expr", source: LOGO_CONDITION },
    classes: ["mb-2", "inline-block"],
    attrs: {
      href: { kind: "binding", path: "brand.href" },
      rel: { kind: "static", value: "nofollow" },
    },
    children: [
      {
        id: BRAND_LOGO_IMG_ID,
        kind: "element",
        tag: "img",
        // Every utility here is one the storefront stylesheet ALREADY carries.
        // The tree is stored data, so it renders against whatever CSS is
        // deployed — an invented arbitrary value (`max-w-[180px]`) would have no
        // rule until the next build scanned this file, and the logo would render
        // at full size in the meantime.
        classes: ["h-16", "w-auto", "max-w-[200px]", "object-contain"],
        attrs: {
          src: { kind: "binding", path: "brand.imageUrl" },
          alt: { kind: "binding", path: "brand.name" },
          width: { kind: "static", value: "600" },
          height: { kind: "static", value: "300" },
        },
      },
    ],
  };
}

/** Copy of a tree with the brand-logo link in place, plus what happened. */
export interface BrandLogoResult {
  tree: NodeTree;
  /** False when the tree already carried the link (re-run) or has no anchor. */
  inserted: boolean;
  /** Node id the link was inserted BEFORE — the eyebrow, or the product title. */
  anchorId: string | null;
  /** True when the text eyebrow was demoted to the no-logo fallback. */
  eyebrowGuarded: boolean;
}

// Structural walk over a plain-record view of the tree, exactly as
// strip-stock-nodes does: `BuilderNode` is a union whose members carry
// different child arrays, and everything the transform does not touch is copied
// through byte for byte so component instances, styles and bindings survive.
type NodeRecord = Record<string, unknown> & { id?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function hasNode(node: NodeRecord, id: string): boolean {
  if (node.id === id) return true;
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    for (const child of kids as NodeRecord[]) {
      if (child && typeof child === "object" && hasNode(child, id)) return true;
    }
  }
  return false;
}

/** True for the seed's product title: the `<h1>` bound to `product.name`. */
function isProductTitle(node: NodeRecord): boolean {
  if (node.tag !== "h1") return false;
  const parts = node.text;
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (p) =>
      p != null &&
      typeof p === "object" &&
      (p as { kind?: unknown; path?: unknown }).kind === "binding" &&
      (p as { path?: unknown }).path === "product.name"
  );
}

/**
 * Where the logo goes: immediately before the brand eyebrow when the tree has
 * one, otherwise immediately before the product title. Industry Kitchens'
 * authored template has no eyebrow — its buy column opens with the `<h1>` — so
 * matching on the title as well is what lets one pass serve both sites.
 */
function isAnchor(node: NodeRecord): boolean {
  return node.id === BRAND_EYEBROW_ID || isProductTitle(node);
}

/** The eyebrow only shows when there is no logo to show instead. */
function guardEyebrow(node: NodeRecord): NodeRecord {
  return { ...node, condition: { kind: "expr", source: EYEBROW_FALLBACK_CONDITION } };
}

function insert(
  node: NodeRecord,
  state: { done: boolean; anchorId: string | null; eyebrowGuarded: boolean }
): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const out: NodeRecord[] = [];
    for (const child of kids as NodeRecord[]) {
      if (!child || typeof child !== "object") {
        out.push(child);
        continue;
      }
      if (!state.done && isAnchor(child)) {
        state.done = true;
        state.anchorId = typeof child.id === "string" ? child.id : "(unnamed)";
        out.push(brandLogoLinkNode() as unknown as NodeRecord);
        if (child.id === BRAND_EYEBROW_ID) {
          state.eyebrowGuarded = true;
          out.push(guardEyebrow(child));
        } else {
          out.push(insert(child, state));
        }
        continue;
      }
      out.push(insert(child, state));
    }
    next[key] = out;
  }
  return next;
}

/**
 * Put the brand-logo link into a stored (or seed) product tree.
 *
 * Pure and idempotent: a tree that already carries the link comes back
 * untouched with `inserted: false`, so the runner is safe to re-run, and a tree
 * with neither an eyebrow nor a bound `<h1>` is reported rather than guessed at.
 */
export function applyBrandLogoLink(tree: NodeTree): BrandLogoResult {
  const root = tree.root as unknown as NodeRecord;
  if (hasNode(root, BRAND_LOGO_LINK_ID)) {
    return { tree, inserted: false, anchorId: null, eyebrowGuarded: false };
  }
  const state = { done: false, anchorId: null as string | null, eyebrowGuarded: false };
  const nextRoot = insert(root, state);
  if (!state.done) return { tree, inserted: false, anchorId: null, eyebrowGuarded: false };
  return {
    tree: { ...tree, root: nextRoot as unknown as BuilderNode } as NodeTree,
    inserted: true,
    anchorId: state.anchorId,
    eyebrowGuarded: state.eyebrowGuarded,
  };
}

/**
 * Post-condition for the runner: a tree that claims to have the link must
 * actually carry an anchor whose only content is the logo image, with the
 * nofollow rel and a bound alt. Reported as a list of what is missing — empty
 * means the tree is good.
 */
export function checkBrandLogoLink(tree: NodeTree): string[] {
  const problems: string[] = [];
  const found = findNode(tree.root as unknown as NodeRecord, BRAND_LOGO_LINK_ID);
  if (!found) return ["no brand-logo-link node"];
  const attrs = (found.attrs ?? {}) as Record<string, { kind?: string; value?: unknown; path?: unknown }>;
  if (attrs.rel?.value !== "nofollow") problems.push("link is not rel=nofollow");
  if (attrs.href?.path !== "brand.href") problems.push("link does not point at the brand page");
  if (Array.isArray(found.text) && found.text.length > 0) problems.push("link carries text");
  const kids = (found.children ?? []) as NodeRecord[];
  const img = kids.find((k) => k && typeof k === "object" && k.tag === "img");
  if (!img) {
    problems.push("link has no image");
    return problems;
  }
  const imgAttrs = (img.attrs ?? {}) as Record<string, { kind?: string; path?: unknown }>;
  if (imgAttrs.alt?.path !== "brand.name") problems.push("image has no brand-name ALT tag");
  if (imgAttrs.src?.path !== "brand.imageUrl") problems.push("image is not the brand logo");
  return problems;
}

function findNode(node: NodeRecord, id: string): NodeRecord | null {
  if (node.id === id) return node;
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    for (const child of kids as NodeRecord[]) {
      if (!child || typeof child !== "object") continue;
      const hit = findNode(child, id);
      if (hit) return hit;
    }
  }
  return null;
}
