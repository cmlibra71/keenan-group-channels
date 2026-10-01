import { itemHref, panelExtras, type MegaMenuNodeLike, type MegaNavItem } from "./mega-menu";

/**
 * Industry Kitchens drop-down composition (IK menu parity, 2026-10-01): what one department's panel
 * lists, built from the category tree PLUS the Navigation editor's items, so the old Zoey menu's
 * entries that are not categories here (Zoey "menu-link" categories, which point elsewhere) sit
 * exactly where Zoey drew them. Pure; the desktop panel and the phone drawer both read it.
 *
 * Editor shapes it understands (all saved by Storefront > Navigation):
 *   - a CATEGORY item inside a department whose category is one of the department's columns, with
 *     children → those children are appended to that column's links (Zoey's in-column menu links);
 *   - a LINK item inside a department → a column heading of its own (with its children as links);
 *     a PAGE item with children → likewise;
 *   - any other item inside a department (a childless page, the blog) → the information links under
 *     the featured card, as before.
 */

/** One link in a column. */
export type IkPanelLink = { key: string; label: string; href: string; newTab?: boolean };

/** One column group: a heading and its links. */
export type IkPanelGroup = {
  key: string;
  label: string;
  href: string;
  newTab?: boolean;
  links: IkPanelLink[];
  /** Set when links were cut at the column limit: where "View all" goes. */
  moreHref?: string;
  /** Every link the column carries before the cut (column balancing weight). */
  total: number;
};

/** The storefront's drop-down settings (`channel_settings.mega_menu_settings`). */
export type IkMegaMenuSettings = {
  /** Links shown under one column heading before "View all"; null = all of them. */
  columnLinkLimit: number | null;
  /** The red "All Categories" launcher at the start of the bar. */
  allCategoriesLauncher: boolean;
};

/** Today's behaviour, for a channel that has not saved the setting. */
export const DEFAULT_IK_MEGA_MENU_SETTINGS: IkMegaMenuSettings = { columnLinkLimit: 7, allCategoriesLauncher: true };

/** Read the stored setting defensively; anything unreadable keeps today's behaviour. */
export function readIkMegaMenuSettings(value: unknown): IkMegaMenuSettings {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const limit = v.column_link_limit;
  return {
    columnLinkLimit:
      limit === null
        ? null
        : typeof limit === "number" && Number.isInteger(limit) && limit > 0
          ? limit
          : DEFAULT_IK_MEGA_MENU_SETTINGS.columnLinkLimit,
    allCategoriesLauncher: v.all_categories_launcher === false ? false : true,
  };
}

/** The bar link of a department item: the editor's own address when it set one (Brands → /brands,
 *  Clearance → /clearance, whose drop-downs are still their categories'), else the category page. */
export function ikBarHref(item: MegaNavItem, byId: Map<number, MegaMenuNodeLike>): string {
  if (item.type === "category" && item.url && item.url.trim()) return item.url.trim();
  return itemHref(item, byId);
}

/** Does this bar item wear the promotion styling (amber, star)? The editor's `highlight` flag; an
 *  item that never set it keeps the old rule — the Clearance link in the right-hand slot. */
export function ikIsHighlighted(item: MegaNavItem, href: string, inRightSlot: boolean): boolean {
  if (typeof item.highlight === "boolean") return item.highlight;
  return inRightSlot && href === "/clearance";
}

/**
 * A department's columns and its remaining information links.
 * `dept` is the department's category node; `item` the editor item for it (or a bare item).
 */
export function ikPanelGroups(
  dept: MegaMenuNodeLike,
  item: MegaNavItem,
  byId: Map<number, MegaMenuNodeLike>,
  settings: IkMegaMenuSettings = DEFAULT_IK_MEGA_MENU_SETTINGS
): { groups: IkPanelGroup[]; extras: MegaNavItem[]; ordered: boolean } {
  const extras = panelExtras(item);
  const columns = new Map(dept.children.map((c) => [c.id, c]));
  const cut = (links: IkPanelLink[], moreHref: string) => {
    const limit = settings.columnLinkLimit;
    return limit !== null && links.length > limit
      ? { links: links.slice(0, limit), moreHref, total: links.length }
      : { links, total: links.length };
  };
  const linkOf = (n: MegaNavItem, key: string): IkPanelLink => ({ key, label: n.label, href: itemHref(n, byId), newTab: n.newTab || undefined });
  const kidsOf = (e: MegaNavItem) => (e.children ?? []).filter((c) => c.label);
  // Every editor item that names one of the department's columns, with its in-column links.
  const extraLinks = new Map<number, MegaNavItem[]>();
  for (const e of extras) {
    if (e.type === "category" && e.categoryId && columns.has(e.categoryId)) {
      extraLinks.set(e.categoryId, [...(extraLinks.get(e.categoryId) ?? []), ...kidsOf(e)]);
    }
  }
  const treeGroup = (g: MegaMenuNodeLike): IkPanelGroup => {
    const href = `/categories/${g.slug}`;
    // Link ORDER inside a column follows the same rule: the entries the editor lists (the column's
    // own sub-categories as category items, Zoey's menu links as links) in the editor's order, then
    // every sub-category it does not list, in tree order. Nothing listed = the tree's order.
    const leaves = new Map(g.children.map((leaf) => [leaf.id, leaf]));
    const done = new Set<number>();
    const links: IkPanelLink[] = [];
    for (const [j, n] of (extraLinks.get(g.id) ?? []).entries()) {
      if (n.type === "category" && n.categoryId && leaves.has(n.categoryId)) {
        if (done.has(n.categoryId)) continue;
        done.add(n.categoryId);
        const leaf = leaves.get(n.categoryId)!;
        links.push({ key: `c${leaf.id}`, label: leaf.name, href: `/categories/${leaf.slug}` });
        continue;
      }
      links.push(linkOf(n, `x${g.id}-${j}`));
    }
    for (const leaf of g.children) if (!done.has(leaf.id)) links.push({ key: `c${leaf.id}`, label: leaf.name, href: `/categories/${leaf.slug}` });
    return { key: `g${g.id}`, label: g.name, href, ...cut(links, href) };
  };
  // Column ORDER: the columns the editor names (its column categories and its own link columns) in
  // the editor's order — Zoey drew in-between menu-link headings exactly there — then every column
  // the editor does not name, in the category tree's own order.
  const groups: IkPanelGroup[] = [];
  const placed = new Set<number>();
  const rest: MegaNavItem[] = [];
  let own = 0;
  for (const e of extras) {
    if (e.type === "category" && e.categoryId && columns.has(e.categoryId)) {
      if (!placed.has(e.categoryId)) {
        placed.add(e.categoryId);
        groups.push(treeGroup(columns.get(e.categoryId)!));
      }
      continue;
    }
    // A LINK extra is a column heading of its own (Zoey's menu-link headings: Combi Ovens' brand
    // entries, a department's "Coffee Machines >"), with its links if it has any; a PAGE with links
    // is a column too. A childless page / blog stays an information link under the featured card.
    const kids = kidsOf(e);
    if (e.type === "link" || (e.type === "page" && kids.length)) {
      const href = itemHref(e, byId);
      const j = own++;
      groups.push({ key: `o${j}`, label: e.label, href, newTab: e.newTab || undefined, ...cut(kids.map((n, k) => linkOf(n, `o${j}-${k}`)), href) });
      continue;
    }
    rest.push(e);
  }
  const ordered = placed.size > 0 || own > 0;
  for (const g of dept.children) if (!placed.has(g.id)) groups.push(treeGroup(g));
  return { groups, extras: rest, ordered };
}

/**
 * Lay column groups out across `count` columns.
 *
 * `ordered` (the editor named the columns, so their ORDER is the menu's) fills the columns top to
 * bottom in that order — contiguous runs of roughly equal weight — so reading down a column follows
 * the old menu (judge: the Brands list must not read every third brand). Otherwise the tree's own
 * greedy balance, with the same weight the shared panelColumns uses (every link + 2), so a panel with
 * no editor data lays out exactly as it always has.
 */
export function ikBalanceColumns(groups: IkPanelGroup[], count = 3, ordered = false): IkPanelGroup[][] {
  const n = Math.max(1, count);
  const cols: IkPanelGroup[][] = Array.from({ length: n }, () => []);
  const w = (g: IkPanelGroup) => g.total + 2;
  if (ordered) {
    const total = groups.reduce((t, g) => t + w(g), 0);
    let col = 0;
    let acc = 0;
    for (const g of groups) {
      // Move on once this column holds its share, keeping later columns from running empty.
      if (col < n - 1 && acc > 0 && acc + w(g) / 2 > (total * (col + 1)) / n) col++;
      cols[col].push(g);
      acc += w(g);
    }
    return cols;
  }
  const weight = cols.map(() => 0);
  for (const g of groups) {
    let i = 0;
    for (let k = 1; k < cols.length; k++) if (weight[k] < weight[i]) i = k;
    cols[i].push(g);
    weight[i] += w(g);
  }
  return cols;
}
