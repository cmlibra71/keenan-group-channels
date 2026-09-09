import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Card MN702iBv — "Category image sizes".
//
// Steve, 2026-08-24, with a screenshot of an Industry Kitchens category page's
// Subcategories strip: "IK - Increase size of images". Chris the same day: "For
// Industry Kitchen's, increase the size of the cateogry images."
//
// The tile was a 48x48 thumbnail sitting to the LEFT of a wide white card, so
// the white space carried the tile and the photograph was a fraction of it.
// This turns it into a picture-led tile: the image is the top of the card at
// full tile width, the name sits underneath it.
//
// WHY A RENDER-TIME PASS AND NOT ONLY A SOURCE EDIT
// -------------------------------------------------
// Industry Kitchens' category page does NOT render from
// `app/categories/[slug]/page.tsx`. `node_category_template_enabled` is TRUE on
// channel 1 and `cms_pages` row 70 (`__template-category`) holds a published
// Site Builder node tree (version 141), so `renderCategoryNodeBranch` owns the
// page: the tiles a shopper sees are AUTHORED DATA, nested under the section
// labelled `subcategories`. Editing the React route alone would change nothing
// on the live site.
//
// Same shape and the same reasoning as `category-banner-backdrop.ts`: a pure,
// idempotent pass applied on the way to the renderer. Nothing is written back to
// the stored tree, so there is nothing to undo on a rollback, a republish from
// the designer cannot quietly reinstate the small tile, and an author who wants
// a different tile edits the page rather than fighting a migration.
//
// WHY THE CLASSES IT EMITS ARE SAFE
// ---------------------------------
// A class that lives in DATA only exists if the deployed stylesheet already
// carries it (the `brandIntroHtml` rule on `sf-catalog-browse`). Every class
// below is also written, verbatim, in this site's own
// `app/categories/[slug]/page.tsx` and `blocks/category-blocks.tsx` in the SAME
// change, which is what makes Tailwind generate them. Change one and change all
// three, or the tile silently loses its styling on the live page while the
// fallback route still looks right.
//
// THE BUILDER STYLESHEET IS A CLOSED VOCABULARY, AND IT WINS
// ---------------------------------------------------------
// Measured in a browser on 2026-09-05, and it cost an hour: the authored tree
// renders inside `[data-kg-nodes]`, and the channel's published builder CSS
// (`channel_settings.builder_published_css`, injected as `<style
// id="kg-builder-css">`) re-declares its utilities SCOPED to that wrapper. A
// scoped `[data-kg-nodes] .lg\:grid-cols-4` is specificity 0-2-0 and beats
// Tailwind's own `.xl\:grid-cols-6` at 0-1-0, so inside an authored tree a
// class the builder stylesheet does not carry is not merely unstyled — it
// silently loses to the neighbour it was meant to override.
//
// The vocabulary is `{sm,md,lg,xl}:grid-cols-{1..5}` and it STOPS there, which
// is why this grid does too. Read off channel 1's published sheet on
// 2026-09-05: `.lg\:grid-cols-4{` at byte 55885 and `.xl\:grid-cols-5{` at
// 60566 — same specificity, xl declared LATER, so the tree's own
// `xl:grid-cols-5` DOES work and the strip is genuinely five across at >=80rem
// and four at >=64rem. `.xl\:grid-cols-6` is absent from the sheet entirely,
// so THAT is the class that would silently render as four across. Every other
// class this module writes was checked against the same stylesheet and is
// present in it. Check any new one the same way — a probe element appended to
// `<body>` sits outside `[data-kg-nodes]`, will happily style itself, and tells
// you nothing.
//
// A BLIND SPOT WORTH KNOWING
// -------------------------
// The pass and its post-condition walk `children`/`emptyChildren` on the PAGE
// tree only. If the strip is ever moved into a component master (`cms_components`,
// reached through a `ref`/`componentKey` node) the tile reverts to the small
// thumbnail AND `findSmallSubcategoryThumbs` stays quiet — the one failure it
// was written to catch. Follow the ref, or move this pass, if that day comes.
//
// WHY THE TILE IS CAPPED BY COUNT
// -------------------------------
// Steve's screenshot is a six-tile strip and that is the shape the big tile is
// for. Industry Kitchens also has 13 categories whose children are a DIRECTORY
// rather than a strip — `/categories/brands` has 395 of them — and there the
// big tile is actively worse: measured in a browser 2026-09-05, the strip grows
// from 6,782px to 22,689px and the whole page from 19,908px to 35,815px, so the
// products the shopper came for sit three extra screens further down. Above
// `LARGE_TILE_MAX_SUBCATEGORIES` the authored tile is left exactly as it is
// today. 705 of IK's 718 parent categories (98%) are under the cap.
//
// SCOPE — this is an Industry Kitchens ask and it is gated on the CHANNEL, not
// left to the data. `builder/category-node-branch.tsx` is a shared module
// (`orchestrator/shared-modules.json`, drift = build failure) so the call sits
// in all three forks, and Chefs Depot keeps the tile it has. Measured against
// production 2026-09-05: channel 2's `category_layout` tree (version 194) has no
// subcategory section at all — CD dropped the strip from its category page —
// so the pass would be a no-op there anyway. The explicit gate is belt to that
// braces: the card asked for one storefront, and a future CD design that adds a
// subcategory strip must not inherit IK's tile by accident.
// ============================================================================

/** Channels this tile applies to. Industry Kitchens is channel 1. */
export const LARGE_SUBCATEGORY_TILE_CHANNEL_IDS: readonly number[] = [1];

/**
 * The most subcategories that still read as a STRIP. Above this the children
 * are a directory and keep the tile the page has today — see "WHY THE TILE IS
 * CAPPED BY COUNT" above. 24 is five full rows at `xl` and six at `lg`, so the
 * strip never pushes the product listing more than about a screen and a half
 * down, and it covers 705 of Industry Kitchens' 718 parent categories.
 */
export const LARGE_TILE_MAX_SUBCATEGORIES = 24;

/**
 * The section the strip lives in. Matched by LABEL first — that is what an
 * author names the thing and what the node panel shows — with the id from the
 * published tree as the fallback for a section somebody renamed.
 */
export const SUBCATEGORY_SECTION_LABELS = ["subcategories"] as const;
export const SUBCATEGORY_SECTION_IDS = ["n-msh8i4pb-8w1d4"] as const;

/**
 * The new tile, by the label each node carries in the authored tree.
 *
 * - `grid`       the columns the page was already authored with — five across
 *                on a wide desktop, four at `lg`, two on a phone — so Steve's
 *                six tiles still lay out on one or two rows. Only the gutter
 *                grows, because the tiles now carry a picture. Do NOT reach for
 *                a sixth column: `xl:grid-cols-6` is not in the builder
 *                stylesheet and would render as FOUR — see the header.
 * - `tile`       a column instead of a row, clipped so the picture takes the
 *                card's rounded corners.
 * - `thumb`      a full-width square. `relative` stays: the image is a
 *                `fill` image and would collapse without it.
 * - `image`      `object-contain`, not `object-cover`. These are cut-out
 *                product photographs on white; at 48px cropping was invisible,
 *                at ~230px `object-cover` would slice the top and bottom off a
 *                tall fridge. The padding keeps it off the tile's edges.
 * - `no-thumb`   the same square in grey with the package icon, so a category
 *                with no picture keeps the tile's shape (gRLRF8yu: the grey box
 *                stays, and it is never a broken-image glyph).
 * - `name`       under the picture, centred, on its own divider.
 */
export const LARGE_TILE_CLASSES: Readonly<Record<string, readonly string[]>> = {
  grid: ["grid", "grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-5", "gap-4"],
  tile: [
    "group",
    "flex",
    "flex-col",
    "overflow-hidden",
    "rounded-lg",
    "border",
    "border-zinc-200",
    "hover:border-zinc-400",
    "hover:shadow-sm",
    "transition-all",
  ],
  thumb: ["relative", "aspect-square", "w-full", "bg-white"],
  image: ["object-contain", "p-3"],
  "no-thumb": [
    "flex",
    "aspect-square",
    "w-full",
    "items-center",
    "justify-center",
    "bg-zinc-100",
  ],
  "package-icon": ["h-8", "w-8", "text-zinc-300"],
  name: [
    "border-t",
    "border-zinc-200",
    "px-3",
    "py-2.5",
    "text-center",
    "text-sm",
    "font-medium",
    "text-zinc-700",
    "group-hover:text-zinc-900",
    "line-clamp-2",
  ],
};

/**
 * `sizes` for the `fill` image, replacing the old static `48px`. Without this
 * Next would keep asking the image proxy for a 48px-wide source and the bigger
 * tile would render a blurred thumbnail — the exact opposite of the card.
 * Mirrors the grid above.
 */
export const LARGE_TILE_IMAGE_SIZES =
  "(min-width: 1280px) 240px, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 48vw";

export interface SubcategoryTileResult {
  tree: NodeTree;
  /** Labels actually rewritten, in tree order. Empty = nothing matched. */
  rewritten: string[];
  /**
   * Whether this page is one the big tile applies to at all — right channel,
   * and a strip rather than a directory. False means the tree came back
   * untouched ON PURPOSE, which is what the caller's post-condition must not
   * complain about.
   */
  applied: boolean;
}

// Structural walk, for the reason `category-banner-backdrop` spells out:
// `BuilderNode` is a union whose members differ in which child arrays they
// carry, so the pass reads a plain-record view and rewrites only `classes`,
// `attrs` and the two node-list keys. Bindings, conditions, text, component
// instances and everything else are copied through byte for byte.
type NodeRecord = Record<string, unknown> & { id?: unknown; label?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function mapChildren(node: NodeRecord, fn: (child: NodeRecord) => NodeRecord): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    next[key] = (kids as NodeRecord[]).map((child) =>
      child && typeof child === "object" ? fn(child) : child
    );
  }
  return next;
}

/** Rewrite every labelled node inside the strip. Ids are never matched here:
 *  the labels are unique WITHIN this section, and matching by label is what
 *  survives a designer deleting and re-adding a node (fresh generated id). */
function restyle(node: NodeRecord, rewritten: string[]): NodeRecord {
  let next: NodeRecord = { ...node };
  const label = typeof node.label === "string" ? node.label : null;
  const classes = label ? LARGE_TILE_CLASSES[label] : undefined;
  if (label && classes) {
    next.classes = [...classes];
    rewritten.push(label);
    if (label === "image") {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>;
      next.attrs = { ...attrs, sizes: { kind: "static", value: LARGE_TILE_IMAGE_SIZES } };
    }
  }
  next = mapChildren(next, (child) => restyle(child, rewritten));
  return next;
}

function isSection(node: NodeRecord): boolean {
  if (typeof node.label === "string" && SUBCATEGORY_SECTION_LABELS.includes(node.label as never))
    return true;
  return typeof node.id === "string" && SUBCATEGORY_SECTION_IDS.includes(node.id as never);
}

function visit(node: NodeRecord, rewritten: string[]): NodeRecord {
  if (isSection(node)) return restyle(node, rewritten);
  return mapChildren(node, (child) => visit(child, rewritten));
}

/** What decides whether this page gets the big tile. */
export interface SubcategoryTileOptions {
  /**
   * How many subcategories this page is about to render. Omitted means "no
   * idea", which is treated as within the cap — a caller that cannot count
   * still gets the card's behaviour rather than silently losing it.
   */
  subcategoryCount?: number;
  /** Override for tests. */
  channels?: readonly number[];
  /** Override for tests. */
  maxSubcategories?: number;
}

/**
 * Enlarge the subcategory tiles in a stored category-layout tree.
 *
 * Pure and idempotent — the classes are SET, not appended, so running it twice
 * is running it once — and a no-op on a tree with no `subcategories` section
 * (Chefs Depot's), which comes back untouched with `rewritten: []`.
 *
 * Returns the tree unchanged, with `applied: false`, for any channel outside
 * `LARGE_SUBCATEGORY_TILE_CHANNEL_IDS` and for any page whose subcategory count
 * is over `LARGE_TILE_MAX_SUBCATEGORIES`.
 */
export function enlargeSubcategoryTiles(
  tree: NodeTree,
  channelId: number,
  options: SubcategoryTileOptions = {}
): SubcategoryTileResult {
  const channels = options.channels ?? LARGE_SUBCATEGORY_TILE_CHANNEL_IDS;
  const max = options.maxSubcategories ?? LARGE_TILE_MAX_SUBCATEGORIES;
  const count = options.subcategoryCount;
  if (!channels.includes(channelId)) return { tree, rewritten: [], applied: false };
  if (typeof count === "number" && count > max) return { tree, rewritten: [], applied: false };
  const rewritten: string[] = [];
  const root = visit(tree.root as unknown as NodeRecord, rewritten);
  return {
    tree: { ...tree, root: root as unknown as BuilderNode } as NodeTree,
    rewritten,
    applied: true,
  };
}

/**
 * The post-condition, called straight after the pass. Label matching is the
 * mechanism; "the picture, not the white space, carries the tile" is the
 * acceptance criterion, and an author who rebuilds the strip under other labels
 * defeats the mechanism while the screenshot on the card comes straight back.
 *
 * Answers structurally: is there still a subcategory thumbnail pinned to a
 * fixed 48px box? Anything it names has been missed by the pass.
 */
export function findSmallSubcategoryThumbs(tree: NodeTree): string[] {
  const found: string[] = [];
  let inSection = false;
  const walk = (node: NodeRecord) => {
    const entered = !inSection && isSection(node);
    if (entered) inSection = true;
    const classes = node.classes;
    if (
      inSection &&
      Array.isArray(classes) &&
      classes.includes("h-12") &&
      classes.includes("w-12")
    ) {
      found.push(typeof node.id === "string" ? node.id : "(unnamed)");
    }
    for (const key of CHILD_KEYS) {
      const kids = node[key];
      if (Array.isArray(kids)) for (const child of kids as NodeRecord[]) if (child) walk(child);
    }
    if (entered) inSection = false;
  };
  walk(tree.root as unknown as NodeRecord);
  return found;
}
