/**
 * The header menu's data, as ONE serializable object, and everything the bar,
 * the drop-downs and the phone drawer derive from it.
 *
 * WHY THIS EXISTS (perf, 2026-10-02): the drop-down CONTENTS used to be
 * server-rendered into every page — 1,437 /categories/ links of HTML, the same
 * again in the RSC payload, a third copy under "More", and the whole category
 * tree (1,065 nodes with image URLs) passed to the phone drawer as props. That
 * was ~1.2 MB of a 2 MB Industry Kitchens page, on every page. Now a page
 * carries only the bar; the drop-downs and the drawer's lists are drawn in the
 * browser from this object, fetched once per menu version from /api/nav and
 * cached by the browser (see nav-data.ts / nav-data-client.tsx).
 *
 * Pure (no server imports): the server uses it to draw the bar, the browser to
 * draw the panels — from the same object, so the two cannot disagree.
 */
import {
  ALL_BRANDS_HREF,
  flattenTree,
  itemHref,
  panelBrandColumn,
  type MegaBrandLike,
  type MegaMenuFeaturedLike,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "./mega-menu";
import { ikNavItems } from "./ik-nav";
import {
  ikBarHref,
  ikIsHighlighted,
  ikPanelGroups,
  ikSplitNavItems,
  type IkMegaMenuSettings,
} from "./ik-mega-panel";

export type NavData = {
  departments: MegaMenuNodeLike[];
  featured: Record<string, MegaMenuFeaturedLike>;
  items: MegaNavItem[];
  hiddenCategoryIds: number[];
  /** Each Brands column's brands, keyed by department id (`getMegaMenuBrandColumns`). */
  brandColumns: Record<number, MegaBrandLike[]>;
  settings: IkMegaMenuSettings;
};

/** More links than this and a custom link's drop-down becomes a wide panel of columns. */
export const LONG_LINK_DROPDOWN = 12;

export type NavModel = {
  data: NavData;
  navItems: MegaNavItem[];
  byId: Map<number, MegaMenuNodeLike>;
  left: MegaNavItem[];
  right: MegaNavItem[];
};

const models = new WeakMap<NavData, NavModel>();

/** The resolved bar for `data` — memoised per object, as every drop-down asks for it. */
export function navModel(data: NavData): NavModel {
  let model = models.get(data);
  if (!model) {
    const navItems = ikNavItems({
      departments: data.departments,
      items: data.items,
      hiddenCategoryIds: data.hiddenCategoryIds,
      allCategoriesLauncher: data.settings.allCategoriesLauncher,
    });
    model = { data, navItems, byId: flattenTree(data.departments), ...ikSplitNavItems(navItems) };
    models.set(data, model);
  }
  return model;
}

/** Identifies a bar item across a menu edit, so a drop-down never opens under the wrong item. */
export function navItemKey(item: MegaNavItem): string {
  return [item.type, item.categoryId ?? "", item.pageSlug ?? "", item.url ?? "", item.label].join("|");
}

/** The item a lazily drawn drop-down belongs to: by position, confirmed by key. */
export function findNavItem(list: MegaNavItem[], index: number, key: string): MegaNavItem | undefined {
  const at = list[index];
  if (at && navItemKey(at) === key) return at;
  return list.find((i) => navItemKey(i) === key);
}

/**
 * The category tree as the menu needs it — what crosses the wire to the browser.
 * A drop-down reads three levels (department → column → link), so deeper
 * categories are dropped unless an editor item names one (its link resolves by
 * id); and an image survives only where a featured card can show one — a bar
 * department or a category an editor item names. ~80 KB → ~45 KB on IK.
 */
export function slimDepartments(departments: MegaMenuNodeLike[], items: MegaNavItem[]): MegaMenuNodeLike[] {
  const named = new Set<number>();
  const collect = (list: MegaNavItem[]) => {
    for (const i of list) {
      if (i.categoryId != null) named.add(i.categoryId);
      if (i.children?.length) collect(i.children);
    }
  };
  collect(items);
  const slim = (n: MegaMenuNodeLike, depth: number): MegaMenuNodeLike | null => {
    const children = (n.children ?? []).map((c) => slim(c, depth + 1)).filter((c): c is MegaMenuNodeLike => c !== null);
    if (depth > 2 && !named.has(n.id) && children.length === 0) return null;
    return {
      id: n.id,
      name: n.name,
      slug: n.slug,
      ...((depth === 0 || named.has(n.id)) && n.image_url ? { image_url: n.image_url } : {}),
      children,
    };
  };
  return departments.map((d) => slim(d, 0)).filter((d): d is MegaMenuNodeLike => d !== null);
}

/** The editor's items without their default-valued fields (`newTab: false`,
 *  `children: []`), which every reader treats as absent — a third of the bytes. */
export function slimNavItems(items: MegaNavItem[]): MegaNavItem[] {
  return items.map(({ newTab, children, ...rest }) => ({
    ...rest,
    ...(newTab ? { newTab } : {}),
    ...(children?.length ? { children: slimNavItems(children) } : {}),
  }));
}

export type DrawerLink = { key: string; href: string; label: string; newTab?: boolean; heading?: boolean };
export type DrawerRow = {
  key: string;
  href: string;
  label: string;
  newTab?: boolean;
  isClearance: boolean;
  children: DrawerLink[];
};

/**
 * The phone drawer's rows (card 9wau4Tx9: it MIRRORS THE DESKTOP BAR — the same
 * resolved item list, in the same order). A department expands into the desktop
 * panel's own columns (each heading, then its links), its Brands column and any
 * information pages tucked inside it; a custom link with children expands into
 * those.
 */
export function drawerRows(model: NavModel): DrawerRow[] {
  const { navItems, byId, data } = model;
  const rows: DrawerRow[] = [];
  navItems.forEach((item, i) => {
    const key = `${item.type}-${item.categoryId ?? item.pageSlug ?? item.url ?? i}`;
    const dept = item.type === "category" && item.categoryId ? byId.get(item.categoryId) : undefined;
    if (item.type === "category" && !dept) return;

    // The desktop panel's own columns (sub-categories + the editor's column links), so the
    // drawer lists what the drop-down lists: each column heading, then its links.
    const panel = dept ? ikPanelGroups(dept, item, byId, data.settings) : { groups: [], extras: [] };
    const extras = panel.extras;
    // The same Brands column the desktop drop-down carries: a heading,
    // the brands, then View all brands (card HaWBvySC).
    const brandColumn = dept ? panelBrandColumn(item) : null;
    const brandLinks: DrawerLink[] =
      brandColumn && dept
        ? [
            { key: "bh", href: ALL_BRANDS_HREF, label: brandColumn.label || "Brands", heading: true },
            ...(data.brandColumns[dept.id] ?? []).map((b) => ({
              key: `b${b.id}`,
              href: `/brands/${b.slug}`,
              label: b.name,
            })),
            { key: "ba", href: ALL_BRANDS_HREF, label: "View all brands" },
          ]
        : [];
    const children: DrawerLink[] = [
      ...panel.groups.flatMap((g) => [
        { key: g.key, href: g.href, label: g.label, newTab: g.newTab, heading: true },
        ...g.links.map((l) => ({ key: l.key, href: l.href, label: l.label, newTab: l.newTab })),
        ...(g.moreHref ? [{ key: `${g.key}-more`, href: g.moreHref, label: "View all" }] : []),
      ]),
      ...brandLinks,
      ...extras.map((e, j) => ({
        key: `e${j}`,
        href: itemHref(e, byId),
        label: e.label,
        newTab: e.newTab,
      })),
      ...(dept
        ? []
        : (item.children ?? []).map((c, j) => ({
            key: `c${j}`,
            href: itemHref(c, byId),
            label: c.label,
            newTab: c.newTab,
          }))),
    ];
    const href = ikBarHref(item, byId);
    // The bar's own rule: the editor's highlight flag, else Clearance as a trailing plain link.
    const isClearance = ikIsHighlighted(item, href, !dept && !(item.children ?? []).length);
    rows.push({ key, href, label: item.label, newTab: item.newTab, isClearance, children });
  });
  return rows;
}

/** A drawer row as the page ships it — what it expands into is drawn in the browser. */
export type DrawerRowHead = Omit<DrawerRow, "children"> & { hasChildren: boolean };

export function drawerRowHeads(model: NavModel): DrawerRowHead[] {
  return drawerRows(model).map(({ children, ...row }) => ({ ...row, hasChildren: children.length > 0 }));
}
