/**
 * Mega-menu composition — the shared, channel-agnostic logic behind the
 * department bar, its panels and the mobile drawer.
 *
 * The menu is AUTOMATIC first and configured second (card 9wau4Tx9, Steve
 * 2026-08-10): every top-level category of the channel's tree appears by
 * default, sub-category panels fill themselves from the tree, and the only
 * per-category control is an off switch (`mega_menu_hidden_categories`, a
 * channel setting written by the portal's Storefront > Navigation > Mega menu
 * tab). What the Navigation editor holds (`nav_structure.header`) is the ORDER
 * and the EXTRAS — the gold All Departments entry, Clearance, custom links and
 * the information pages tucked inside a department's drop-down; a department
 * the editor never mentions is still added automatically, so adding a category
 * in the portal is enough to put it in the menu.
 *
 * A department's drop-down can also carry a BRANDS column (card HaWBvySC): a
 * `brands` item the editor put inside the department, listing either the
 * brands staff chose or, by default, the department's busiest brands on this
 * storefront, plus "View all brands". Words only, no logos.
 *
 * Deliberately free of storefront imports so template/ and every site share one
 * byte-identical copy (orchestrator/shared-modules.json).
 */

/** A category-tree node as the storefront store hands it over. */
export type MegaMenuNodeLike = {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  children: MegaMenuNodeLike[];
};

/** One entry of the department bar (an editor item, or an auto-added department). */
export type MegaNavItem = {
  type: "categories" | "category" | "page" | "blog" | "link" | "brands";
  label: string;
  url?: string;
  categoryId?: number;
  pageSlug?: string;
  newTab?: boolean;
  children?: MegaNavItem[];
  /** True when the bar added this department itself rather than the editor. */
  auto?: boolean;
  /**
   * A `brands` item's CHOSEN brands, in the order staff put them. Absent or
   * empty = automatic: the brands with the most products in that department on
   * this storefront (card HaWBvySC).
   */
  brandIds?: number[];
};

/** A brand as a drop-down's Brands column lists it — words and an address, no
 *  logo (Steve, 2026-08-10: no pictures in a drop-down). */
export type MegaBrandLike = { id: number; name: string; slug: string };

/** How many brands a Brands column lists — the same twelve the department
 *  page's own Brand filter shows, and the most the editor lets staff choose. */
export const BRAND_COLUMN_LIMIT = 12;

/** Where "View all brands" (and a Brands item anywhere else) goes. */
export const ALL_BRANDS_HREF = "/brands";

/** The editable promo card at the right of a department's panel. */
export type MegaMenuFeaturedLike = {
  heading?: string;
  body?: string;
  cta_text?: string;
  cta_href?: string;
  image_url?: string;
};

/** Bar labels are shortened ("Cooking", "Food Prep") so more departments fit
 *  one row before the More menu has to take over. */
export function shortNavLabel(name: string): string {
  return name
    .replace(/\s+Equipment$/i, "")
    .replace(/\s*&\s*Chemicals$/i, "")
    .replace(/Preparation$/i, "Prep")
    .trim();
}

/** categoryId → node, across every depth of the tree. */
export function flattenTree(departments: MegaMenuNodeLike[]): Map<number, MegaMenuNodeLike> {
  const byId = new Map<number, MegaMenuNodeLike>();
  const walk = (nodes: MegaMenuNodeLike[]) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(departments);
  return byId;
}

export function itemHref(item: MegaNavItem, byId: Map<number, MegaMenuNodeLike>): string {
  if (item.type === "categories") return "/categories";
  if (item.type === "category" && item.categoryId) {
    const node = byId.get(item.categoryId);
    if (node) return `/categories/${node.slug}`;
  }
  if (item.type === "page" && item.pageSlug) return `/pages/${item.pageSlug}`;
  if (item.type === "blog") return "/blog";
  // A Brands item that is not a department's column (dragged onto the bar, or
  // under a plain link) is simply a link to the brands index.
  if (item.type === "brands") return ALL_BRANDS_HREF;
  return item.url || "#";
}

const NAV_ITEM_TYPES = new Set<MegaNavItem["type"]>([
  "categories",
  "category",
  "page",
  "blog",
  "link",
  "brands",
]);

/**
 * Read the Navigation editor's saved tree (`nav_structure.header`) into bar
 * items. Saved items carry a type; anything hand-written, older or of a type
 * this build does not know is read as a LINK, so one odd row can never take the
 * header down. Unlabelled items are dropped.
 */
export function normalizeNavItems(value: unknown): MegaNavItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => {
      const type = NAV_ITEM_TYPES.has(i.type as MegaNavItem["type"])
        ? (i.type as MegaNavItem["type"])
        : "link";
      const item: MegaNavItem = {
        type,
        label: typeof i.label === "string" ? i.label : "",
        url: typeof i.url === "string" ? i.url : undefined,
        categoryId: typeof i.categoryId === "number" ? i.categoryId : undefined,
        pageSlug: typeof i.pageSlug === "string" ? i.pageSlug : undefined,
        newTab: i.newTab === true,
        children: normalizeNavItems(i.children),
      };
      if (type === "brands" && Array.isArray(i.brandIds)) {
        item.brandIds = i.brandIds.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id)
        );
      }
      return item;
    })
    .filter((i) => i.label);
}

function isPlainLink(item: MegaNavItem): boolean {
  return (
    item.type !== "categories" && item.type !== "category" && !(item.children && item.children.length)
  );
}

/**
 * The trailing run of childless plain links sits right of the spacer (the
 * Clearance slot in the design) — but only when the bar carries departments; an
 * all-links nav renders as one left group. Items with a drop-down always stay
 * left (the right slot has none).
 */
export function splitNavItems(items: MegaNavItem[]): { left: MegaNavItem[]; right: MegaNavItem[] } {
  const hasDepts = items.some((n) => n.type === "categories" || n.type === "category");
  let split = items.length;
  if (hasDepts) {
    while (split > 0 && isPlainLink(items[split - 1])) split--;
  }
  return { left: items.slice(0, split), right: items.slice(split) };
}

/** The bar's built-in structure: All Departments, every department, Clearance. */
function defaultNavItems(departments: MegaMenuNodeLike[]): MegaNavItem[] {
  return [
    { type: "categories", label: "All Departments" },
    ...departments.map((d) => ({
      type: "category" as const,
      label: d.name,
      categoryId: d.id,
      auto: true,
    })),
    { type: "link" as const, label: "Clearance", url: "/clearance" },
  ];
}

/** The department slug a `/categories/<slug>` address names, else null. */
function departmentSlug(url: string | undefined): string | null {
  if (!url) return null;
  const match = /^\/categories\/([^/?#]+)\/?$/.exec(url.trim());
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

/**
 * A saved menu item that is a plain LINK to `/categories/<slug>` IS that
 * department, so read it as one.
 *
 * Industry Kitchens' saved header came from the old flat `header_nav` list, so
 * every item is `type: "link"` with a hardcoded `/categories/...` address (card
 * mOTgYEvX). Taken literally those items are not departments, which meant the
 * bar added each department a SECOND time automatically, printed the same
 * wording twice, gave the link no drop-down, and — worse — let a department the
 * portal had switched OFF stay on the bar through its link. Matching on the
 * slug fixes all four at once and needs no data migration: the item keeps the
 * editor's own label and position, and simply becomes the department it always
 * pointed at.
 *
 * Only an exact `/categories/<slug>` match is adopted. `/clearance`, `/brands`
 * and `/pages/...` stay the plain links they are, on both storefronts.
 */
export function adoptDepartmentLinks(
  items: MegaNavItem[],
  departments: MegaMenuNodeLike[]
): MegaNavItem[] {
  const bySlug = new Map(departments.map((d) => [d.slug.toLowerCase(), d]));
  return items.map((item) => {
    if (item.type !== "link") return item;
    const slug = departmentSlug(item.url);
    const dept = slug ? bySlug.get(slug) : undefined;
    if (!dept) return item;
    return { ...item, type: "category" as const, categoryId: dept.id, url: undefined };
  });
}

/**
 * Compose what the bar renders: the editor's items in the editor's order, minus
 * any department switched off, plus every department the editor does not
 * mention (added where the departments already sit, so Clearance and other
 * trailing links stay where they are). No editor items at all = the built-in
 * default bar.
 */
export function resolveNavItems({
  departments,
  items,
  hiddenCategoryIds,
}: {
  departments: MegaMenuNodeLike[];
  items?: MegaNavItem[] | null;
  hiddenCategoryIds?: number[] | null;
}): MegaNavItem[] {
  const hidden = new Set(hiddenCategoryIds ?? []);
  const visible = departments.filter((d) => !hidden.has(d.id));

  const configured = adoptDepartmentLinks(items ?? [], departments).filter(
    (i) => !(i.type === "category" && i.categoryId != null && hidden.has(i.categoryId))
  );
  if (configured.length === 0) return defaultNavItems(visible);

  const named = new Set<number>();
  for (const i of configured) {
    if (i.type === "category" && i.categoryId != null) named.add(i.categoryId);
  }
  // A department is kept off the bar by exactly ONE thing: its off switch. It is
  // tempting to also drop a department whose NAME already appears on the bar —
  // the Industry Kitchens tree keeps "Brands" and "Clearance Sale" categories
  // next to the editor's own /brands and /clearance links, so both words print
  // twice. That was tried and reverted (card mOTgYEvX): it made the portal lie.
  // The Mega menu tab lists every department with a switch and counts how many
  // are "in the menu", so a department the code suppresses behind the editor's
  // back is a switch that does nothing and a count that is wrong — which is the
  // very complaint this card was raised about. Duplicate wording is a visible
  // choice a person can fix with the switch; an inert switch is not.
  const missing: MegaNavItem[] = visible
    .filter((d) => !named.has(d.id))
    .map((d) => ({ type: "category" as const, label: d.name, categoryId: d.id, auto: true }));
  if (missing.length === 0) return configured;

  // Insert after the last department item, else after the All Departments
  // entry, else in front of everything (a bar of nothing but custom links —
  // departments lead it, and its links fall into the right-hand slot).
  let at = -1;
  for (let i = 0; i < configured.length; i++) if (configured[i].type === "category") at = i;
  if (at < 0) for (let i = 0; i < configured.length; i++) if (configured[i].type === "categories") at = i;
  const insertAt = at >= 0 ? at + 1 : 0;
  return [...configured.slice(0, insertAt), ...missing, ...configured.slice(insertAt)];
}

/**
 * A department panel's three link columns: depth-1 children become column
 * groups, balanced by the number of links they carry.
 */
export function panelColumns(groups: MegaMenuNodeLike[], columnCount = 3): MegaMenuNodeLike[][] {
  const columns: MegaMenuNodeLike[][] = Array.from({ length: columnCount }, () => []);
  const weights = new Array(columnCount).fill(0);
  for (const g of groups) {
    let i = 0;
    for (let c = 1; c < columnCount; c++) if (weights[c] < weights[i]) i = c;
    columns[i].push(g);
    weights[i] += (g.children?.length ?? 0) + 2;
  }
  return columns;
}

/** The extra information pages/links an editor tucked inside a department.
 *  A Brands column is NOT an extra — it renders as a link column of its own. */
export function panelExtras(item: MegaNavItem): MegaNavItem[] {
  return (item.children ?? []).filter((c) => c.label && c.type !== "brands");
}

/** The Brands column an editor put inside a department's drop-down, if any
 *  (card HaWBvySC). One per department: a second is ignored. */
export function panelBrandColumn(item: MegaNavItem): MegaNavItem | null {
  if (item.type !== "category") return null;
  return (item.children ?? []).find((c) => c.type === "brands") ?? null;
}

/** How many sub-category columns a panel keeps. The panel has three link
 *  columns; a Brands column takes the last of them. */
export function subcategoryColumnCount(hasBrandColumn: boolean): number {
  return hasBrandColumn ? 2 : 3;
}

/** One department's Brands column, as the header must fetch it. */
export type BrandColumnRequest = { categoryId: number; brandIds: number[] };

/**
 * Which departments carry a Brands column, and which of those staff filled by
 * hand. Read from the editor's items after link adoption, so an Industry
 * Kitchens department saved as a `/categories/<slug>` link counts too. Empty
 * when nobody has added one — the header then fetches nothing at all.
 */
export function brandColumnRequests(
  items: MegaNavItem[] | null | undefined,
  departments: MegaMenuNodeLike[]
): BrandColumnRequest[] {
  const seen = new Set<number>();
  const out: BrandColumnRequest[] = [];
  for (const item of adoptDepartmentLinks(items ?? [], departments)) {
    const column = panelBrandColumn(item);
    if (!column || item.categoryId == null || seen.has(item.categoryId)) continue;
    seen.add(item.categoryId);
    out.push({ categoryId: item.categoryId, brandIds: column.brandIds ?? [] });
  }
  return out;
}

/**
 * The brands one column lists.
 *
 * CHOSEN brands (the column's `brandIds`) print in the order staff put them.
 * With none chosen the column is AUTOMATIC: `topBrands` — the department's own
 * busiest brands, busiest first, which is the same list its Brand filter shows.
 *
 * Either way a brand must still be one this storefront sells (`channelBrands`,
 * which also supplies the slug the link needs): a brand whose last product left
 * the site drops out rather than linking to an empty page. Capped at
 * BRAND_COLUMN_LIMIT.
 */
export function resolveBrandColumn({
  brandIds,
  topBrands,
  channelBrands,
}: {
  brandIds?: number[] | null;
  topBrands?: { id: number }[] | null;
  channelBrands: MegaBrandLike[];
}): MegaBrandLike[] {
  const byId = new Map(channelBrands.map((b) => [b.id, b]));
  const ids = brandIds && brandIds.length > 0 ? brandIds : (topBrands ?? []).map((b) => b.id);
  const out: MegaBrandLike[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const brand = byId.get(id);
    if (!brand || !brand.slug || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: brand.id, name: brand.name, slug: brand.slug });
    if (out.length >= BRAND_COLUMN_LIMIT) break;
  }
  return out;
}
