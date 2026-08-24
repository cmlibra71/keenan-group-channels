import type { NodeTree } from "@keenan/services/builder";

// ============================================================================
// Card tSrCcnvx — the AUTHORED half of "missing images default to the brand
// logo" (Tim, 2026-08-19). Industry Kitchens only.
//
// WHY CODE AND NOT AUTHORING. Industry Kitchens' listing tiles are not drawn by
// `ProductCard.tsx` on every screen: `node_category_template_enabled` is on for
// channel 1, so a category page renders the stored `product-card` COMPONENT
// master out of `cms_components`. Editing the React card alone would fix search
// results and leave every category page with grey boxes — which is the half a
// card-shaped change misses. Both halves ship here.
//
// The transform is applied at RENDER time (`@/lib/store` wraps `getComponents`
// / `getDraftComponents`), the same choice `product-image-notice.ts` made and
// for the same reasons: nothing is written to the stored tree, so a rollback has
// nothing to undo, a re-publish from the Site Builder cannot silently drop it,
// and the portal's editor still shows the author their own tree.
//
// WHAT IT DOES. The master already carries two mutually exclusive branches
// inside the square image stage:
//
//   <img  condition: props.card.image_url>              the photo
//   <div  condition: !props.card.image_url>             the grey package box
//
// A third is inserted between them for the brand logo, and the grey box is
// narrowed so exactly one branch can ever be true:
//
//   <img  condition: !props.card.image_url && props.card.brand_logo_url>
//   <div  condition: !props.card.image_url && !props.card.brand_logo_url>
//
// `object-contain` with padding, NOT the photo's `object-cover`: brand logos are
// normalised to 600x300, and `object-cover` in a square stage crops half the
// width off a 2:1 image — the logo would arrive unreadable, which is not what
// Tim asked for.
//
// The transform is anchored on the grey box's CONDITION rather than on a node
// id, because component-master ids are generated (`n-msh95giu-7ch8h`) and are
// not stable between channels or across a re-extract.
// ============================================================================

/** The component key of the shared listing tile. */
export const PRODUCT_CARD_KEY = "product-card";

/**
 * The HOME page's clearance rail, which is a SECOND authored master and the one
 * a card-shaped change misses twice over.
 *
 * Industry Kitchens draws product tiles three different ways: the React
 * `ProductCard` (search, `/products`), the `product-card` master (category and
 * brand pages), and — on the home page — this rail, exploded out of
 * `ClearanceSpotlight` into its own master and placed on the authored home tree
 * as `home-clearance-spotlight`. It has the same two image branches as the
 * listing tile but binds through the repeat's item alias (`card.image_url`)
 * rather than `props.card.*`, so the same transform runs over it with a
 * different prefix. Both the React component and this master are fixed, because
 * either can be the live path: the master renders while `node_home_enabled` is
 * on, and the component renders the legacy and CMS homes if it is ever off.
 */
export const CLEARANCE_SPOTLIGHT_KEY = "home-clearance-spotlight";

/** Node id of the inserted image — also the idempotency marker. */
export const BRAND_LOGO_FALLBACK_ID = "card-brand-logo-fallback";

/** The same marker for the clearance rail's own master. */
export const CLEARANCE_BRAND_LOGO_FALLBACK_ID = "clearance-brand-logo-fallback";

/** The grey package box's condition in the master as authored. */
export const NO_IMAGE_CONDITION = "!props.card.image_url";

/** What the grey box's condition becomes: no photo AND no logo to show instead. */
export const NO_IMAGE_NO_LOGO_CONDITION = "!props.card.image_url && !props.card.brand_logo_url";

/** What the brand logo shows on: no photo, but a usable logo. */
export const BRAND_LOGO_CONDITION = "!props.card.image_url && props.card.brand_logo_url";

/** The photo branch's condition, as authored — the anchor for the broken-file swap. */
export const PHOTO_CONDITION = "props.card.image_url";

/** Classes the photo takes on when it swaps to the logo (never `object-cover`). */
export const BRAND_LOGO_CLASSES = ["object-contain", "p-6"] as const;

/**
 * The clearance rail pads its PHOTOS `p-4`, not `p-6`, so its logo matches the
 * stage it stands in. Same reasoning either way: contained, never cropped.
 */
export const CLEARANCE_BRAND_LOGO_CLASSES = ["object-contain", "p-4"] as const;

/** One authored master this transform knows how to fix. */
export interface BrandLogoTarget {
  /** `cms_components.key`. */
  key: string;
  /**
   * How the master addresses the row — `props.card` for the listing tile, whose
   * row arrives as a component PROP, and `card` for the clearance rail, whose
   * row is a repeat item. Every condition and binding below is built from it,
   * so nothing is hard-coded twice.
   */
  prefix: string;
  /** Node id of the inserted logo, and the idempotency marker for that master. */
  logoId: string;
  /** Classes for the inserted logo and for the broken-file swap. */
  logoClasses: readonly string[];
  /** `sizes` for the inserted logo — the stage's own, so it downloads no more than the photo did. */
  sizes: string;
}

export const BRAND_LOGO_TARGETS: readonly BrandLogoTarget[] = [
  {
    key: PRODUCT_CARD_KEY,
    prefix: "props.card",
    logoId: BRAND_LOGO_FALLBACK_ID,
    logoClasses: BRAND_LOGO_CLASSES,
    sizes: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  },
  {
    key: CLEARANCE_SPOTLIGHT_KEY,
    prefix: "card",
    logoId: CLEARANCE_BRAND_LOGO_FALLBACK_ID,
    logoClasses: CLEARANCE_BRAND_LOGO_CLASSES,
    sizes: "(max-width: 640px) 50vw, 33vw",
  },
];

/** The four condition strings a target's master is matched and rewritten on. */
function expressions(prefix: string) {
  return {
    photo: `${prefix}.image_url`,
    greyBox: `!${prefix}.image_url`,
    logo: `!${prefix}.image_url && ${prefix}.brand_logo_url`,
    greyBoxNarrowed: `!${prefix}.image_url && !${prefix}.brand_logo_url`,
    logoPath: `${prefix}.brand_logo_url`,
    namePath: `${prefix}.brand_name`,
  };
}

// The walk is structural, exactly as `strip-stock-nodes.ts` and
// `brand-logo-link.ts` do it: `BuilderNode` is a union whose members carry
// different child arrays, so the transform reads a plain-record view and copies
// everything it does not touch through byte for byte. That is what keeps an
// authored tree's component instances, styles, bindings and events intact.
type NodeRecord = Record<string, unknown> & { id?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function conditionSource(node: NodeRecord): string {
  const cond = node.condition as { kind?: unknown; source?: unknown } | undefined;
  if (!cond || typeof cond !== "object") return "";
  return typeof cond.source === "string" ? cond.source.trim() : "";
}

/** The grey package box: the node whose condition is exactly "no image url". */
function isGreyBox(node: NodeRecord, target: BrandLogoTarget): boolean {
  return conditionSource(node) === expressions(target.prefix).greyBox;
}

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

/**
 * The brand-logo image node.
 *
 * `fill` mirrors the photo it stands in for, so the logo occupies the same
 * square stage the tile already reserves — `BuilderImage` hands a node that
 * declares `fill` straight to `next/image`, so no intrinsic size is invented.
 * Every class is one the storefront stylesheet already carries: the tree is
 * stored DATA and renders against whatever CSS is deployed, so an invented
 * arbitrary value would have no rule and the logo would render unstyled.
 */
function brandLogoNode(target: BrandLogoTarget): NodeRecord {
  const e = expressions(target.prefix);
  return {
    id: target.logoId,
    kind: "element",
    tag: "img",
    label: "brand-logo-fallback",
    condition: { kind: "expr", source: e.logo },
    classes: [...target.logoClasses],
    attrs: {
      src: { kind: "binding", path: e.logoPath },
      alt: { kind: "binding", path: e.namePath },
      fill: { kind: "static", value: "true" },
      sizes: { kind: "static", value: target.sizes },
    },
  };
}

/** The grey box, narrowed so it and the logo can never both be true. */
function narrowGreyBox(node: NodeRecord, target: BrandLogoTarget): NodeRecord {
  return {
    ...node,
    condition: { kind: "expr", source: expressions(target.prefix).greyBoxNarrowed },
  };
}

/**
 * The photo node, taught to fall back when its FILE is not there.
 *
 * The condition above only answers "is there a URL" — it cannot know the object
 * behind that URL is missing, and nothing on the server can. `BuilderImage`
 * reads these three attributes and swaps on the browser's `error` event, once,
 * to the same picture an imageless product would have shown. Nothing else about
 * the node changes: same src, same alt, same classes until something breaks.
 */
function withBrokenFileFallback(node: NodeRecord, target: BrandLogoTarget): NodeRecord {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (attrs["data-fallback-src"]) return node;
  const e = expressions(target.prefix);
  return {
    ...node,
    attrs: {
      ...attrs,
      "data-fallback-src": { kind: "binding", path: e.logoPath },
      "data-fallback-alt": { kind: "binding", path: e.namePath },
      "data-fallback-class": { kind: "static", value: target.logoClasses.join(" ") },
    },
  };
}

/** True for the master's photo branch — the <img> shown when a URL exists. */
function isPhoto(node: NodeRecord, target: BrandLogoTarget): boolean {
  return node.tag === "img" && conditionSource(node) === expressions(target.prefix).photo;
}

function insert(
  node: NodeRecord,
  state: { inserted: boolean },
  target: BrandLogoTarget
): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const out: unknown[] = [];
    for (const child of kids as NodeRecord[]) {
      if (!child || typeof child !== "object") {
        out.push(child);
        continue;
      }
      if (isPhoto(child, target)) {
        out.push(withBrokenFileFallback(child, target));
        continue;
      }
      if (isGreyBox(child, target)) {
        state.inserted = true;
        out.push(brandLogoNode(target));
        out.push(narrowGreyBox(insert(child, state, target), target));
        continue;
      }
      out.push(insert(child, state, target));
    }
    next[key] = out;
  }
  return next;
}

/** A tree with the brand-logo fallback in place, plus whether anything changed. */
export interface BrandLogoCardResult {
  tree: NodeTree;
  /** False when the tree already carried it, or carries no grey box to anchor on. */
  inserted: boolean;
}

/**
 * Put the brand-logo fallback into one authored master's tree.
 *
 * Pure and idempotent: a tree that already carries the node comes back
 * untouched, and a tree with no grey-box branch (a redesigned card) is reported
 * rather than guessed at — it simply keeps whatever empty state it has.
 *
 * The target defaults to the `product-card` listing tile, which is what every
 * existing caller means.
 */
export function applyBrandLogoFallback(
  tree: NodeTree,
  target: BrandLogoTarget = BRAND_LOGO_TARGETS[0]
): BrandLogoCardResult {
  const root = tree?.root as unknown as NodeRecord | undefined;
  if (!root || typeof root !== "object") return { tree, inserted: false };
  if (hasNode(root, target.logoId)) return { tree, inserted: false };

  const state = { inserted: false };
  // The root itself can be the grey box only in a degenerate tree; the anchor is
  // always a CHILD of the image stage, so the walk starts below the root.
  const nextRoot = insert(root, state, target);
  if (!state.inserted) return { tree, inserted: false };
  return { tree: { ...tree, root: nextRoot } as unknown as NodeTree, inserted: true };
}

/**
 * The whole component map with every tile-drawing master transformed.
 *
 * Every other master is passed through by reference — this must never be the
 * thing that rewrites a tree it was not asked about — and a channel missing one
 * of the targets (or all of them) comes back unchanged.
 */
export function withBrandLogoFallback<T extends Record<string, unknown>>(components: T): T {
  if (!components || typeof components !== "object") return components;
  let out = components;
  for (const target of BRAND_LOGO_TARGETS) {
    const master = out[target.key] as NodeTree | undefined;
    if (!master || typeof master !== "object") continue;
    const { tree, inserted } = applyBrandLogoFallback(master, target);
    if (!inserted) continue;
    out = { ...out, [target.key]: tree };
  }
  return out;
}
