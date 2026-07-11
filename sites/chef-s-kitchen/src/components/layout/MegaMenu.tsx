import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, Star } from "lucide-react";
import type { MegaMenuNode, MegaMenuFeatured, HeaderNavItem } from "@/lib/store";
import { MegaMenuShell } from "./MegaMenuShell";

/**
 * Design-system nav bar (Green-700), driven by the Navigation editor
 * (`nav_structure.header`) with CSS-driven mega panels. Item types:
 *   - `categories`  → the gold "All Departments" entry (→ /categories)
 *   - `category`    → a department link with its auto mega panel (3 link
 *                     columns from the category tree + featured card)
 *   - anything else → a custom link, with an optional simple dropdown of
 *                     children
 * With no editor items the bar renders its built-in default: All Departments,
 * the first 6 departments, and Clearance. Pure server component — panels open
 * on hover and :focus-within, so it's keyboard operable without JS. Hidden
 * below lg (the MobileNavDrawer takes over).
 */
/** Design nav uses short department labels ("Cooking", "Food Prep") so the
 *  bar stays single-line. */
function shortNavLabel(name: string): string {
  return name
    .replace(/\s+Equipment$/i, "")
    .replace(/\s*&\s*Chemicals$/i, "")
    .replace(/Preparation$/i, "Prep")
    .trim();
}

/** The bar's built-in structure — what renders when the Navigation editor has
 *  no header items, and what the editor seeds itself from. */
function defaultNavItems(departments: MegaMenuNode[]): HeaderNavItem[] {
  return [
    { type: "categories", label: "All Departments" },
    ...departments.slice(0, 6).map((d) => ({
      type: "category" as const,
      label: d.name,
      categoryId: d.id,
    })),
    { type: "link" as const, label: "Clearance", url: "/clearance" },
  ];
}

/** categoryId → node, across every depth of the tree. */
function flattenTree(departments: MegaMenuNode[]): Map<number, MegaMenuNode> {
  const byId = new Map<number, MegaMenuNode>();
  const walk = (nodes: MegaMenuNode[]) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(departments);
  return byId;
}

function itemHref(item: HeaderNavItem, byId: Map<number, MegaMenuNode>): string {
  if (item.type === "categories") return "/categories";
  if (item.type === "category" && item.categoryId) {
    const node = byId.get(item.categoryId);
    if (node) return `/categories/${node.slug}`;
  }
  if (item.type === "page" && item.pageSlug) return `/pages/${item.pageSlug}`;
  if (item.type === "blog") return "/blog";
  return item.url || "#";
}

export function MegaMenu({
  departments,
  featured,
  items,
}: {
  departments: MegaMenuNode[];
  featured: Record<string, MegaMenuFeatured>;
  items?: HeaderNavItem[];
}) {
  const navItems = items && items.length > 0 ? items : defaultNavItems(departments);
  const byId = flattenTree(departments);

  // The trailing run of childless plain links sits right of the spacer (the
  // Clearance slot in the design) — but only when the bar has department
  // items; an all-links nav (legacy custom nav) renders as one left group.
  // Items with dropdown children always stay left (the right slot has none).
  const hasDepts = navItems.some((n) => n.type === "categories" || n.type === "category");
  let split = navItems.length;
  if (hasDepts) {
    while (split > 0) {
      const prev = navItems[split - 1];
      const isPlainLink =
        prev.type !== "categories" && prev.type !== "category" && !(prev.children?.length);
      if (!isPlainLink) break;
      split--;
    }
  }
  const leftItems = navItems.slice(0, split);
  const rightItems = navItems.slice(split);

  return (
    <MegaMenuShell className="hidden lg:block bg-brand-deep relative">
      <div className="container-page">
        <ul className="flex items-stretch gap-0.5">
          {leftItems.map((item, i) => renderItem(item, i, byId, featured))}

          <li className="flex-1" aria-hidden />

          {rightItems.map((item, i) => (
            <li key={`r-${i}`}>
              <Link
                href={itemHref(item, byId)}
                target={item.newTab ? "_blank" : undefined}
                className="flex h-full items-center gap-1.5 whitespace-nowrap px-3 py-[13px] text-[13px] font-bold text-member-bright transition-colors duration-200 hover:text-member"
              >
                {itemHref(item, byId) === "/clearance" && (
                  <Star className="h-3.5 w-3.5 fill-current" />
                )}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MegaMenuShell>
  );
}

function renderItem(
  item: HeaderNavItem,
  i: number,
  byId: Map<number, MegaMenuNode>,
  featured: Record<string, MegaMenuFeatured>
) {
  if (item.type === "categories") {
    return (
      <li key={`l-${i}`}>
        <Link
          href="/categories"
          className="flex h-full items-center gap-2 whitespace-nowrap bg-member px-4 py-[13px] text-[13.5px] font-bold text-ink-900 transition-colors duration-200 hover:bg-member-bright"
        >
          <Menu className="h-4 w-4" strokeWidth={2.2} />
          {item.label || "All Departments"}
        </Link>
      </li>
    );
  }

  if (item.type === "category" && item.categoryId) {
    const dept = byId.get(item.categoryId);
    if (!dept) return null; // hidden/deleted category — drop the item
    return (
      <li key={`l-${i}`} className="group/nav">
        <Link
          href={`/categories/${dept.slug}`}
          className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
        >
          {shortNavLabel(item.label || dept.name)}
          {dept.children.length > 0 && (
            <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
          )}
        </Link>

        {dept.children.length > 0 && (
          <MegaPanel dept={dept} feat={featured[String(dept.id)]} />
        )}
      </li>
    );
  }

  // Custom link (link / page / blog), with an optional simple dropdown.
  const children = item.children ?? [];
  return (
    <li key={`l-${i}`} className="group/nav relative">
      <Link
        href={itemHref(item, byId)}
        target={item.newTab ? "_blank" : undefined}
        className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
      >
        {item.label}
        {children.length > 0 && (
          <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
        )}
      </Link>
      {children.length > 0 && (
        <div className="mega-panel invisible absolute left-0 top-full z-50 min-w-[220px] rounded-b-card border border-black/5 bg-white py-2 opacity-0 shadow-hover transition-all duration-150 group-hover/nav:visible group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:opacity-100">
          {children.map((child, j) => (
            <Link
              key={j}
              href={itemHref(child, byId)}
              target={child.newTab ? "_blank" : undefined}
              className="block px-4 py-2 text-[13.5px] text-text-primary transition-colors hover:bg-brand-tint hover:text-brand-deep"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

function MegaPanel({ dept, feat }: { dept: MegaMenuNode; feat?: MegaMenuFeatured }) {
  // 3 link columns: depth-1 children become column groups, balanced across
  // columns; their children are the links (the group itself when childless).
  const groups = dept.children;
  const columns: MegaMenuNode[][] = [[], [], []];
  const weights = [0, 0, 0];
  for (const g of groups) {
    const i = weights.indexOf(Math.min(...weights));
    columns[i].push(g);
    weights[i] += g.children.length + 2;
  }

  return (
    <div
      className="mega-panel invisible absolute left-0 right-0 top-full z-[110] translate-y-2 opacity-0 transition-all duration-200
                 group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100
                 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100"
    >
      <div className="container-page">
        <div className="grid max-w-[1100px] grid-cols-[1fr_1fr_1fr_240px] gap-6 rounded-b-card border border-border border-t-[3px] border-t-member bg-white p-6 shadow-lg">
          {columns.map((col, i) => (
            <div key={i} className="space-y-5">
              {col.map((group) => (
                <div key={group.id}>
                  <Link
                    href={`/categories/${group.slug}`}
                    className="mb-2 block border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent-dark hover:text-accent"
                  >
                    {group.name}
                  </Link>
                  {group.children.slice(0, 7).map((leaf) => (
                    <Link
                      key={leaf.id}
                      href={`/categories/${leaf.slug}`}
                      className="block py-[5px] text-[13px] text-ink-700 transition-colors duration-200 hover:text-accent"
                    >
                      {leaf.name}
                    </Link>
                  ))}
                  {group.children.length > 7 && (
                    <Link
                      href={`/categories/${group.slug}`}
                      className="block py-[5px] text-[13px] font-semibold text-accent hover:text-accent-hover"
                    >
                      View all →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Featured panel — self-start so it stays a compact card (image + copy)
              instead of stretching to the full mega-menu row height. */}
          <div className="flex flex-col self-start overflow-hidden rounded-card bg-brand-tint">
            <div className="relative grid h-[120px] place-items-center bg-gradient-to-br from-brand-mid to-brand-deep">
              {(feat?.image_url ?? dept.image_url) && (
                <Image src={(feat?.image_url ?? dept.image_url)!} alt="" fill sizes="240px" className="object-cover" />
              )}
            </div>
            <div className="p-3.5">
              <b className="mb-0.5 block text-sm text-text-primary">
                {feat?.heading ?? `Shop ${dept.name}`}
              </b>
              <p className="mb-2.5 text-xs text-steel-500">
                {feat?.body ?? "Member pricing across the full range."}
              </p>
              <Link
                href={feat?.cta_href ?? `/categories/${dept.slug}`}
                className="btn-primary btn-sm"
              >
                {feat?.cta_text ?? "Shop now"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
