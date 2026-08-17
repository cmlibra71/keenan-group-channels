"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, Star } from "lucide-react";
import {
  flattenTree,
  itemHref,
  panelExtras,
  resolveNavItems,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "@/lib/mega-menu";

/**
 * Below lg the nav becomes a hamburger → full-height drawer.
 *
 * It MIRRORS THE DESKTOP BAR (card 9wau4Tx9, Steve 2026-08-10: "it should be
 * the same as the desktop menu"): the same resolved item list, in the same
 * order, with every department switched off in the portal missing from both.
 * A department expands into its sub-categories plus any information pages
 * tucked inside it; a custom link with children expands into those.
 */
export function MobileNavDrawer({
  departments,
  items,
  hiddenCategoryIds,
}: {
  departments: MegaMenuNodeLike[];
  items?: MegaNavItem[];
  hiddenCategoryIds?: number[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const navItems = resolveNavItems({ departments, items, hiddenCategoryIds });
  const byId = flattenTree(departments);
  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-zinc-600 transition-colors duration-200 hover:text-zinc-900 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/50" onClick={close} />
          <div className="absolute inset-y-0 left-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-lg">
            <div className="flex items-center justify-between bg-zinc-900 px-4 py-4">
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                Categories
              </span>
              <button onClick={close} aria-label="Close menu" className="text-white/90 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {navItems.map((item, i) => {
                const key = `${item.type}-${item.categoryId ?? item.pageSlug ?? item.url ?? i}`;
                const dept = item.type === "category" && item.categoryId ? byId.get(item.categoryId) : undefined;
                if (item.type === "category" && !dept) return null;

                const extras = panelExtras(item);
                const groups = dept?.children ?? [];
                const childLinks: { key: string; href: string; label: string; newTab?: boolean }[] = [
                  ...groups.map((g) => ({ key: `g${g.id}`, href: `/categories/${g.slug}`, label: g.name })),
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
                const href = dept ? `/categories/${dept.slug}` : itemHref(item, byId);
                const isClearance = href === "/clearance";

                return (
                  <div key={key} className="border-b border-zinc-200">
                    <div className="flex items-center">
                      <Link
                        href={href}
                        target={item.newTab ? "_blank" : undefined}
                        onClick={close}
                        className={`flex flex-1 items-center gap-2 px-4 py-3.5 text-sm font-semibold ${
                          isClearance ? "text-amber-600" : "text-zinc-900"
                        }`}
                      >
                        {isClearance && <Star className="h-4 w-4 fill-current" />}
                        {item.label}
                      </Link>
                      {childLinks.length > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === key ? null : key)}
                          aria-label={`Expand ${item.label}`}
                          aria-expanded={expanded === key}
                          className="px-4 py-3.5 text-zinc-600"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${expanded === key ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {expanded === key && childLinks.length > 0 && (
                      <div className="bg-zinc-50 pb-2">
                        {childLinks.map((child) => (
                          <Link
                            key={child.key}
                            href={child.href}
                            target={child.newTab ? "_blank" : undefined}
                            onClick={close}
                            className="block px-6 py-2.5 text-sm text-zinc-700 hover:text-teal-600"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
