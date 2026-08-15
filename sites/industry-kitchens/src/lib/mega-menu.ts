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
  type: "categories" | "category" | "page" | "blog" | "link";
  label: string;
  url?: string;
  categoryId?: number;
  pageSlug?: string;
  newTab?: boolean;
  children?: MegaNavItem[];
  /** True when the bar added this department itself rather than the editor. */
  auto?: boolean;
};

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
  return item.url || "#";
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

  const configured = (items ?? []).filter(
    (i) => !(i.type === "category" && i.categoryId != null && hidden.has(i.categoryId))
  );
  if (configured.length === 0) return defaultNavItems(visible);

  const named = new Set<number>();
  for (const i of configured) if (i.type === "category" && i.categoryId != null) named.add(i.categoryId);
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

/** The extra information pages/links an editor tucked inside a department. */
export function panelExtras(item: MegaNavItem): MegaNavItem[] {
  return (item.children ?? []).filter((c) => c.label);
}
