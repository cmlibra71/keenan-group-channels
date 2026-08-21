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

/** Node id of the inserted image — also the idempotency marker. */
export const BRAND_LOGO_FALLBACK_ID = "card-brand-logo-fallback";

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
function isGreyBox(node: NodeRecord): boolean {
  return conditionSource(node) === NO_IMAGE_CONDITION;
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
function brandLogoNode(): NodeRecord {
  return {
    id: BRAND_LOGO_FALLBACK_ID,
    kind: "element",
    tag: "img",
    label: "brand-logo-fallback",
    condition: { kind: "expr", source: BRAND_LOGO_CONDITION },
    classes: [...BRAND_LOGO_CLASSES],
    attrs: {
      src: { kind: "binding", path: "props.card.brand_logo_url" },
      alt: { kind: "binding", path: "props.card.brand_name" },
      fill: { kind: "static", value: "true" },
      sizes: {
        kind: "static",
        value: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
      },
    },
  };
}

/** The grey box, narrowed so it and the logo can never both be true. */
function narrowGreyBox(node: NodeRecord): NodeRecord {
  return { ...node, condition: { kind: "expr", source: NO_IMAGE_NO_LOGO_CONDITION } };
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
function withBrokenFileFallback(node: NodeRecord): NodeRecord {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (attrs["data-fallback-src"]) return node;
  return {
    ...node,
    attrs: {
      ...attrs,
      "data-fallback-src": { kind: "binding", path: "props.card.brand_logo_url" },
      "data-fallback-alt": { kind: "binding", path: "props.card.brand_name" },
      "data-fallback-class": { kind: "static", value: BRAND_LOGO_CLASSES.join(" ") },
    },
  };
}

/** True for the master's photo branch — the <img> shown when a URL exists. */
function isPhoto(node: NodeRecord): boolean {
  return node.tag === "img" && conditionSource(node) === PHOTO_CONDITION;
}

function insert(node: NodeRecord, state: { inserted: boolean }): NodeRecord {
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
      if (isPhoto(child)) {
        out.push(withBrokenFileFallback(child));
        continue;
      }
      if (isGreyBox(child)) {
        state.inserted = true;
        out.push(brandLogoNode());
        out.push(narrowGreyBox(insert(child, state)));
        continue;
      }
      out.push(insert(child, state));
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
 * Put the brand-logo fallback into a `product-card` tree.
 *
 * Pure and idempotent: a tree that already carries the node comes back
 * untouched, and a tree with no grey-box branch (a redesigned card) is reported
 * rather than guessed at — it simply keeps whatever empty state it has.
 */
export function applyBrandLogoFallback(tree: NodeTree): BrandLogoCardResult {
  const root = tree?.root as unknown as NodeRecord | undefined;
  if (!root || typeof root !== "object") return { tree, inserted: false };
  if (hasNode(root, BRAND_LOGO_FALLBACK_ID)) return { tree, inserted: false };

  const state = { inserted: false };
  // The root itself can be the grey box only in a degenerate tree; the anchor is
  // always a CHILD of the image stage, so the walk starts below the root.
  const nextRoot = insert(root, state);
  if (!state.inserted) return { tree, inserted: false };
  return { tree: { ...tree, root: nextRoot } as unknown as NodeTree, inserted: true };
}

/**
 * The whole component map with the `product-card` master transformed.
 *
 * Every other master is passed through by reference — this must never be the
 * thing that rewrites a tree it was not asked about — and a channel with no
 * `product-card` master comes back unchanged.
 */
export function withBrandLogoFallback<T extends Record<string, unknown>>(components: T): T {
  const card = components?.[PRODUCT_CARD_KEY] as NodeTree | undefined;
  if (!card || typeof card !== "object") return components;
  const { tree, inserted } = applyBrandLogoFallback(card);
  if (!inserted) return components;
  return { ...components, [PRODUCT_CARD_KEY]: tree };
}
