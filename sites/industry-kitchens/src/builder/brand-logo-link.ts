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
// Card GwzIv4M9 — "Product page: show a clickable brand logo that links to the
// brand page" — finishes the same rule's third acceptance line: a brand with NO
// logo falls back to the brand NAME as a text LINK, not the plain text it used
// to be. Three mutually exclusive nodes now sit in the same slot, in this order:
//
//   brand-logo-link   logo image, linked   brand.imageUrl && brand.href
//   brand-name-link   brand name, linked   brand.name && !brand.imageUrl && brand.href
//   brand-eyebrow     brand name, plain    brand.name && !brand.imageUrl && !brand.href
//
// so a brand can never show two of them, a product with no brand shows none,
// and a brand whose page we cannot address still prints its name rather than a
// dead link. Placement is unchanged (top of the buy column, above the product
// title) — that is uzeXShZu's deliberate decision, not the spot marked on the
// card's screenshot.
//
// Everything the nodes bind already exists on the product payload
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

/**
 * Shown only when the brand has both a logo and a page to link to.
 *
 * NOTE (tSrCcnvx): this condition does NOT run the logo through
 * `usableBrandLogo` / `isAllowedImageUrl`, while the gallery's brand-logo
 * fallback does. A brand logo stored outside the image proxy's allowlist would
 * therefore draw a broken-image glyph HERE while the gallery below correctly
 * kept the grey box — the two would disagree on the same page. Defensive only
 * today: all 412 logos live in our own buckets. Left alone deliberately, because
 * a binding expression cannot call a predicate; if a logo ever lands off-bucket,
 * fix it by tightening what `brands.image_url` may hold, not by forking this.
 */
export const LOGO_CONDITION = "brand.imageUrl && brand.href";

/**
 * The brand NAME as a link — the fallback for the 6 of 418 brands that carry no
 * logo (card GwzIv4M9). It is the same slot, the same `rel="nofollow"` and the
 * same destination as the logo link; only the content differs, so a shopper who
 * meets a logo-less brand still gets to that brand's page.
 *
 * `!brand.imageUrl` is what keeps it exclusive with the logo: a brand never
 * shows both, which is the rule uzeXShZu put on this surface.
 */
export const BRAND_NAME_LINK_ID = "brand-name-link";
export const NAME_LINK_CONDITION = "brand.name && !brand.imageUrl && brand.href";

/**
 * The plain-text eyebrow is now the LAST resort: a brand with neither a logo nor
 * a page we can address. `brand.href` is `/brands/<slug>` and every brand row
 * carries a slug, so this is defensive — but the alternative is an `<a>` with no
 * `href`, which reads as a link and goes nowhere.
 */
export const EYEBROW_FALLBACK_CONDITION = "brand.name && !brand.imageUrl && !brand.href";

/**
 * Classes for the name link on a template that has NO eyebrow to copy from —
 * Industry Kitchens' authored tree opens its buy column with the `<h1>`. Every
 * one of these already appears in IK's published product tree, so they are
 * certain to exist in the deployed stylesheet: a stored tree is data and renders
 * against whatever CSS is live, so an invented utility would simply not apply.
 */
export const DEFAULT_BRAND_NAME_LINK_CLASSES = [
  "mb-2",
  "inline-block",
  "text-sm",
  "font-semibold",
  "text-zinc-600",
  "hover:text-zinc-900",
  "transition-colors",
];

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


/**
 * The brand-name link node — the no-logo fallback (card GwzIv4M9).
 *
 * Same destination, same `rel="nofollow"` and the same slot as the logo link;
 * the content is the brand's NAME, so the link's accessible name is the brand,
 * exactly as the logo's ALT text gives it. Classes default to the set proved
 * present in Industry Kitchens' published tree — `applyBrandLogoLink` prefers
 * the eyebrow's own classes where a template has one, so Chefs Depot's fallback
 * keeps the eyebrow's look to the pixel and only becomes clickable.
 */
export function brandNameLinkNode(classes: string[] = DEFAULT_BRAND_NAME_LINK_CLASSES): BuilderNode {
  return {
    id: BRAND_NAME_LINK_ID,
    kind: "element",
    tag: "a",
    label: "Brand name → brand page",
    condition: { kind: "expr", source: NAME_LINK_CONDITION },
    classes: [...classes],
    attrs: {
      href: { kind: "binding", path: "brand.href" },
      rel: { kind: "static", value: "nofollow" },
    },
    text: [{ kind: "binding", path: "brand.name" }],
  };
}

/** Copy of a tree with the brand links in place, plus what happened. */
export interface BrandLogoResult {
  tree: NodeTree;
  /** False when the tree already carried everything (re-run) or has no anchor. */
  inserted: boolean;
  /** True when THIS pass added the logo link. */
  logoInserted: boolean;
  /** True when THIS pass added the brand-name (no-logo) link. */
  nameLinkInserted: boolean;
  /** Node id the links were inserted BEFORE — the eyebrow, or the product title. */
  anchorId: string | null;
  /** True when the text eyebrow's condition was narrowed to the last resort. */
  eyebrowGuarded: boolean;
}

// Structural walk over a plain-record view of the tree, exactly as
// strip-stock-nodes does: `BuilderNode` is a union whose members carry
// different child arrays, and everything the transform does not touch is copied
// through byte for byte so component instances, styles and bindings survive.
type NodeRecord = Record<string, unknown> & { id?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function hasNode(node: NodeRecord, id: string): boolean {
  return findNode(node, id) != null;
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
 * Where the links go: immediately before the brand eyebrow when the tree has
 * one, otherwise immediately before the product title. Industry Kitchens'
 * authored template has no eyebrow — its buy column opens with the `<h1>` — so
 * matching on the title as well is what lets one pass serve both sites.
 */
function isAnchor(node: NodeRecord): boolean {
  return node.id === BRAND_EYEBROW_ID || isProductTitle(node);
}

/** The eyebrow is the last resort: no logo AND no brand page to link to. */
function guardEyebrow(node: NodeRecord): NodeRecord {
  return { ...node, condition: { kind: "expr", source: EYEBROW_FALLBACK_CONDITION } };
}

function conditionSource(node: NodeRecord): string | null {
  const c = node.condition as { kind?: unknown; source?: unknown } | undefined;
  if (!c || typeof c !== "object" || c.kind !== "expr") return null;
  return typeof c.source === "string" ? c.source : null;
}

/**
 * The name link built FROM the eyebrow, so a site that already styles its brand
 * line keeps that styling exactly and only gains the anchor. Everything the
 * eyebrow carries (classes, styles, the `brand.name` text binding) is copied
 * through; only the id, the tag, the condition and the link attributes change.
 * `inline-block` is appended because an `<a>` is inline by default and the
 * eyebrow's vertical margin would otherwise do nothing — it is the same utility
 * the logo anchor beside it already uses on both sites.
 */
function nameLinkFromEyebrow(eyebrow: NodeRecord): NodeRecord {
  const classes = Array.isArray(eyebrow.classes) ? [...(eyebrow.classes as string[])] : [];
  if (!classes.includes("inline-block")) classes.push("inline-block");
  const attrs = (eyebrow.attrs ?? {}) as Record<string, unknown>;
  return {
    ...eyebrow,
    id: BRAND_NAME_LINK_ID,
    tag: "a",
    label: "Brand name → brand page",
    classes,
    attrs: {
      ...attrs,
      href: { kind: "binding", path: "brand.href" },
      rel: { kind: "static", value: "nofollow" },
    },
    condition: { kind: "expr", source: NAME_LINK_CONDITION },
  };
}

interface InsertState {
  logoInserted: boolean;
  nameLinkInserted: boolean;
  eyebrowGuarded: boolean;
  anchorId: string | null;
}

interface InsertPlan {
  needLogo: boolean;
  needName: boolean;
  nameNode: () => NodeRecord;
  state: InsertState;
}

function insert(node: NodeRecord, plan: InsertPlan): NodeRecord {
  const next: NodeRecord = { ...node };
  const { state } = plan;
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const out: NodeRecord[] = [];
    for (const child of kids as NodeRecord[]) {
      if (!child || typeof child !== "object") {
        out.push(child);
        continue;
      }

      // The logo link is already here (a re-run, or the seed): the name link
      // belongs immediately after it, so the three brand nodes stay in order.
      if (child.id === BRAND_LOGO_LINK_ID) {
        out.push(insert(child, plan));
        if (plan.needName && !state.nameLinkInserted) {
          out.push(plan.nameNode());
          state.nameLinkInserted = true;
        }
        continue;
      }

      // Nothing inserted yet and this is the slot the pair belongs in.
      if (plan.needLogo && !state.logoInserted && isAnchor(child)) {
        state.logoInserted = true;
        state.anchorId = typeof child.id === "string" ? child.id : "(unnamed)";
        out.push(brandLogoLinkNode() as unknown as NodeRecord);
        if (plan.needName && !state.nameLinkInserted) {
          out.push(plan.nameNode());
          state.nameLinkInserted = true;
        }
        if (child.id === BRAND_EYEBROW_ID) {
          state.eyebrowGuarded = true;
          out.push(guardEyebrow(child));
        } else {
          out.push(insert(child, plan));
        }
        continue;
      }

      // The eyebrow wherever it sits: narrowed to the last resort.
      if (child.id === BRAND_EYEBROW_ID) {
        if (conditionSource(child) !== EYEBROW_FALLBACK_CONDITION) state.eyebrowGuarded = true;
        out.push(guardEyebrow(child));
        continue;
      }

      out.push(insert(child, plan));
    }
    next[key] = out;
  }
  return next;
}

/**
 * Put the brand links into a stored (or seed) product tree.
 *
 * Pure and idempotent: a tree that already carries both links and the narrowed
 * eyebrow comes back untouched with `inserted: false`, so the runner is safe to
 * re-run, and a tree with neither an eyebrow nor a bound `<h1>` is reported
 * rather than guessed at. A tree that carries only the LOGO link — every live
 * tree before card GwzIv4M9 — gains the name link beside it.
 */
export function applyBrandLogoLink(tree: NodeTree): BrandLogoResult {
  const root = tree.root as unknown as NodeRecord;
  const nothing: BrandLogoResult = {
    tree,
    inserted: false,
    logoInserted: false,
    nameLinkInserted: false,
    anchorId: null,
    eyebrowGuarded: false,
  };

  const eyebrow = findNode(root, BRAND_EYEBROW_ID);
  const needLogo = !hasNode(root, BRAND_LOGO_LINK_ID);
  const needName = !hasNode(root, BRAND_NAME_LINK_ID);
  const needGuard = eyebrow != null && conditionSource(eyebrow) !== EYEBROW_FALLBACK_CONDITION;
  if (!needLogo && !needName && !needGuard) return nothing;

  const state: InsertState = {
    logoInserted: false,
    nameLinkInserted: false,
    eyebrowGuarded: false,
    anchorId: null,
  };
  const nextRoot = insert(root, {
    needLogo,
    needName,
    nameNode: () => (eyebrow ? nameLinkFromEyebrow(eyebrow) : (brandNameLinkNode() as unknown as NodeRecord)),
    state,
  });

  const changed = state.logoInserted || state.nameLinkInserted || state.eyebrowGuarded;
  if (!changed) return nothing;
  return {
    tree: { ...tree, root: nextRoot as unknown as BuilderNode } as NodeTree,
    inserted: true,
    logoInserted: state.logoInserted,
    nameLinkInserted: state.nameLinkInserted,
    anchorId: state.anchorId,
    eyebrowGuarded: state.eyebrowGuarded,
  };
}

/**
 * Post-condition for the runner: a tree that claims to have the links must
 * actually carry an anchor whose only content is the logo image, with the
 * nofollow rel and a bound alt, AND a name link beside it for the brands with no
 * logo, AND — where the template has one — a plain eyebrow narrowed so that no
 * two of the three can ever show at once. Reported as a list of what is missing
 * — empty means the tree is good.
 */
export function checkBrandLogoLink(tree: NodeTree): string[] {
  const problems: string[] = [];
  const root = tree.root as unknown as NodeRecord;
  const found = findNode(root, BRAND_LOGO_LINK_ID);
  if (!found) return ["no brand-logo-link node"];
  const attrs = (found.attrs ?? {}) as Record<string, { kind?: string; value?: unknown; path?: unknown }>;
  if (attrs.rel?.value !== "nofollow") problems.push("link is not rel=nofollow");
  if (attrs.href?.path !== "brand.href") problems.push("link does not point at the brand page");
  if (Array.isArray(found.text) && found.text.length > 0) problems.push("link carries text");
  if (conditionSource(found) !== LOGO_CONDITION) problems.push("logo link is not conditioned on the brand having a logo");
  const kids = (found.children ?? []) as NodeRecord[];
  const img = kids.find((k) => k && typeof k === "object" && k.tag === "img");
  if (!img) {
    problems.push("link has no image");
  } else {
    const imgAttrs = (img.attrs ?? {}) as Record<string, { kind?: string; path?: unknown }>;
    if (imgAttrs.alt?.path !== "brand.name") problems.push("image has no brand-name ALT tag");
    if (imgAttrs.src?.path !== "brand.imageUrl") problems.push("image is not the brand logo");
  }

  // The no-logo fallback (card GwzIv4M9).
  const nameLink = findNode(root, BRAND_NAME_LINK_ID);
  if (!nameLink) {
    problems.push("no brand-name-link node — a brand with no logo would not link anywhere");
  } else {
    const nameAttrs = (nameLink.attrs ?? {}) as Record<string, { kind?: string; value?: unknown; path?: unknown }>;
    if (nameLink.tag !== "a") problems.push("the brand-name fallback is not a link");
    if (nameAttrs.rel?.value !== "nofollow") problems.push("brand-name link is not rel=nofollow");
    if (nameAttrs.href?.path !== "brand.href") problems.push("brand-name link does not point at the brand page");
    if (conditionSource(nameLink) !== NAME_LINK_CONDITION) {
      problems.push("brand-name link is not exclusive with the logo");
    }
    const text = nameLink.text;
    const bindsName =
      Array.isArray(text) &&
      text.some(
        (p) =>
          p != null &&
          typeof p === "object" &&
          (p as { kind?: unknown; path?: unknown }).kind === "binding" &&
          (p as { path?: unknown }).path === "brand.name"
      );
    if (!bindsName) problems.push("brand-name link does not print the brand name");
  }

  const eyebrow = findNode(root, BRAND_EYEBROW_ID);
  if (eyebrow && conditionSource(eyebrow) !== EYEBROW_FALLBACK_CONDITION) {
    problems.push("the plain brand line can still show beside a logo or a brand-name link");
  }
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
