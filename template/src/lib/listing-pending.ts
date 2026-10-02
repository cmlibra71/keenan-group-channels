import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { MAX_PRICE_TRAIL, parseRangeParam, priceWindowTrail } from "./category-attributes";

// ============================================================================
// Pure helpers behind the instant filter controls (see ./listing-nav.tsx).
//
//  - toggleListParam      one tick box's next address
//  - overlayPendingFilters the page payload as it WILL read once the server
//                          answers: every authored tick box, the sort select and
//                          Clear all show the shopper's change at once
//  - withListingGridMarks  tags the element that holds the product cards, so
//                          the site's CSS can swap each card for a loader of the
//                          same size while a change loads
// ============================================================================

/** Copy of `params` with `value` ticked on or off in the comma list `param`; paging reset. */
export function toggleListParam(params: URLSearchParams, param: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const set = new Set(next.get(param)?.split(",").filter(Boolean) ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  if (set.size > 0) next.set(param, [...set].join(","));
  else next.delete(param);
  next.delete("page"); // filters reset pagination
  return next;
}

// ── Payload overlay ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Which URL param each authored facet collection is ticked through. */
const FACET_PARAMS: Record<string, string> = {
  subcategories: "sub",
  brands: "brand",
  price: "price",
  // A brand page's Zoey price bands (value = the price window) answer to the same param.
  price_bands: "price",
  availability: "stock",
};

const listOf = (params: URLSearchParams, param: string) =>
  params.get(param)?.split(",").filter(Boolean) ?? [];

/** `600-900`, `600-`, `-900` → window; anything else → undefined. */
function windowOf(raw: string | null): { min?: number; max?: number } | undefined {
  const m = /^(\d*\.?\d*)-(\d*\.?\d*)$/.exec(raw ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return undefined;
  const n = (s: string) => (s === "" ? undefined : Number(s));
  return { min: n(m[1]), max: n(m[2]) };
}

function withSelected(options: unknown, ticked: string[]): unknown {
  if (!Array.isArray(options)) return options;
  return options.map((o) => {
    const row = o as Row;
    const selected = ticked.includes(String(row.value));
    return row.selected === selected ? row : { ...row, selected };
  });
}

/** Any filter at all on the address (the same set the page's Clear all removes). */
function hasAnyFilter(params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (!value) continue;
    if (key.startsWith("f_") || Object.values(FACET_PARAMS).includes(key)) return true;
  }
  return false;
}

/**
 * The composed category payload with `listing` re-read from `params`: each
 * facet option's `selected`, attribute windows, `hasActiveFilters`, `sort`, and
 * the active chips minus any the shopper just removed. Products, counts and
 * totals are left alone — only the server can know those.
 *
 * Returns `payload` itself when it has no listing.
 */
export function overlayPendingFilters(payload: object, params: URLSearchParams): object {
  const p = payload as Row;
  const listing = p.listing as Row | undefined;
  if (!listing || typeof listing !== "object") return payload;
  const facets = (listing.facets ?? {}) as Row;

  const nextFacets: Row = { ...facets };
  for (const [key, param] of Object.entries(FACET_PARAMS)) {
    if (key in facets) nextFacets[key] = withSelected(facets[key], listOf(params, param));
  }
  if (Array.isArray(facets.attributes)) {
    nextFacets.attributes = facets.attributes.map((a) => {
      const attr = a as Row;
      const param = String(attr.param ?? "");
      if (!param) return attr;
      if (attr.kind === "range") {
        const w = windowOf(params.get(param));
        return { ...attr, selectedMin: w?.min, selectedMax: w?.max };
      }
      return { ...attr, options: withSelected(attr.options, listOf(params, param)) };
    });
  }

  const chips = Array.isArray(listing.activeChips)
    ? listing.activeChips.filter((c) => {
        const chip = c as Row;
        const param = String(chip.param ?? "");
        const raw = params.get(param);
        if (!raw) return false;
        const value = String(chip.value ?? "");
        return raw === value || raw.split(",").includes(value);
      })
    : listing.activeChips;

  const sort = params.get("sort");
  return {
    ...p,
    listing: {
      ...listing,
      facets: nextFacets,
      hasActiveFilters: hasAnyFilter(params),
      activeChips: chips,
      ...(sort ? { sort } : {}),
    },
  };
}

// ── Grid marks ──────────────────────────────────────────────────────────────

/** The attribute the site CSS keys the loaders on. */
export const LISTING_GRID_ATTR = "data-listing-grid";
const PRODUCTS_SOURCE = "listing.products";

function holdsProductRepeat(node: BuilderNode): boolean {
  return (
    node.kind === "element" &&
    (node.children ?? []).some((c) => c.kind === "repeat" && c.source === PRODUCTS_SOURCE)
  );
}

function mark(node: BuilderNode): BuilderNode {
  if (node.kind === "element") {
    const kids = node.children ?? [];
    const nextKids = kids.map(mark);
    const changedKids = nextKids.some((k, i) => k !== kids[i]);
    const needsMark = holdsProductRepeat(node) && node.attrs?.[LISTING_GRID_ATTR] === undefined;
    if (!changedKids && !needsMark) return node;
    return {
      ...node,
      ...(needsMark ? { attrs: { ...(node.attrs ?? {}), [LISTING_GRID_ATTR]: { kind: "static", value: "1" } } } : {}),
      ...(changedKids ? { children: nextKids } : {}),
    };
  }
  if (node.kind === "repeat") {
    const kids = node.children ?? [];
    const nextKids = kids.map(mark);
    const empty = node.emptyChildren ?? [];
    const nextEmpty = empty.map(mark);
    const changed = nextKids.some((k, i) => k !== kids[i]) || nextEmpty.some((k, i) => k !== empty[i]);
    if (!changed) return node;
    return {
      ...node,
      children: nextKids,
      ...(node.emptyChildren ? { emptyChildren: nextEmpty } : {}),
    };
  }
  return node;
}

/**
 * The tree with `data-listing-grid` on every element that directly holds a
 * repeat over `listing.products`. Pure and idempotent; returns the SAME object
 * when there is nothing to mark. Nothing is stored — this runs at render time,
 * like the facet injection beside it.
 */
export function withListingGridMarks(tree: NodeTree): NodeTree {
  if (!tree?.root) return tree;
  const root = mark(tree.root);
  return root === tree.root ? tree : { ...tree, root };
}

/** The component-master map with every product grid in it marked. */
export function withListingGridMarksAll(components: Record<string, NodeTree>): Record<string, NodeTree> {
  let changed = false;
  const out: Record<string, NodeTree> = {};
  for (const [key, tree] of Object.entries(components ?? {})) {
    const next = withListingGridMarks(tree);
    if (next !== tree) changed = true;
    out[key] = next;
  }
  return changed ? out : components;
}


/**
 * A Zoey price band (a price WINDOW, `5000-5999.99`), as Zoey's (Magento 1.9) Price group: a band
 * chosen INSIDE the chosen band joins the trail (`5000-6000,5000-5500`); choosing the last band
 * again (or removing its chip) steps back one level; any other band replaces the trail. Paging
 * resets. Pure (BuilderBrandPage).
 */
export function togglePriceWindow(params: URLSearchParams, value: string): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const trail = priceWindowTrail(next.get("price"));
  const last = trail[trail.length - 1];
  let out: string[];
  if (last === value) out = trail.slice(0, -1);
  else if (last !== undefined && windowInside(value, last)) out = [...trail, value].slice(-MAX_PRICE_TRAIL);
  else out = [value];
  if (out.length) next.set("price", out.join(","));
  else next.delete("price");
  next.delete("page");
  return next;
}

/** True when window `inner` lies within window `outer` (an open end is unbounded). */
function windowInside(inner: string, outer: string): boolean {
  const i = parseRangeParam(inner);
  const o = parseRangeParam(outer);
  if (!i || !o) return false;
  const lo = o.min ?? -Infinity;
  const hi = o.max ?? Infinity;
  return (i.min ?? -Infinity) >= lo && (i.max ?? Infinity) <= hi;
}

/** An old `?cat=` brand link's categories folded into `sub` (the rail writes `sub`). Pure. */
export function foldCatIntoSub(params: URLSearchParams): URLSearchParams {
  if (!params.get("cat")) return params;
  const next = new URLSearchParams(params.toString());
  const merged = [...new Set([...(next.get("sub") ?? "").split(","), ...(next.get("cat") ?? "").split(",")].filter(Boolean))];
  next.delete("cat");
  next.set("sub", merged.join(","));
  return next;
}

/** A brand page's own filter sections for one rail slot (services brandRail `slot`; none = before
 *  Price). Pure. */
export function attributesForSlot<T extends { railSlot?: string }>(attributes: readonly T[] | undefined, slot: string): T[] {
  return (attributes ?? []).filter((a) => (a.railSlot ?? "before_price") === slot);
}
