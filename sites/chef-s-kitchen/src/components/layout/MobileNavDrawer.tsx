"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, Star } from "lucide-react";
import { drawerRows, type DrawerRowHead } from "@/lib/nav-model";
import { useNavData } from "@/lib/nav-data-client";

/**
 * Below lg the nav becomes a hamburger → full-height drawer.
 *
 * It MIRRORS THE DESKTOP BAR (card 9wau4Tx9, Steve 2026-08-10: "it should be
 * the same as the desktop menu"): the same resolved item list, in the same
 * order, with every department switched off in the portal missing from both.
 * A department expands into its sub-categories plus any information pages
 * tucked inside it; a custom link with children expands into those.
 */
export function MobileNavDrawer({ rows }: { rows: DrawerRowHead[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // The rows themselves come with the page (labels and links only); what each
  // expands into is drawn from the menu data, loaded on first open at the latest
  // (lib/nav-model.ts — it used to ship the whole category tree as props).
  const { model, load } = useNavData();
  const childrenByKey = useMemo(
    () => new Map(model ? drawerRows(model).map((r) => [r.key, r.children]) : []),
    [model]
  );
  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => {
          load();
          setOpen(true);
        }}
        className="lg:hidden text-white/90 hover:text-white transition-colors duration-200"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={close} />
          <div className="absolute inset-y-0 left-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-lg">
            <div className="flex items-center justify-between bg-brand px-4 py-4">
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                Departments
              </span>
              <button onClick={close} aria-label="Close menu" className="text-white/90 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => {
                const { key, href, label, newTab, isClearance, hasChildren } = row;
                const childLinks = childrenByKey.get(key) ?? [];

                return (
                  <div key={key} className="border-b border-border">
                    <div className="flex items-center">
                      <Link
                        href={href}
                        target={newTab ? "_blank" : undefined}
                        onClick={close}
                        className={`flex flex-1 items-center gap-2 px-4 py-3.5 text-sm font-semibold ${
                          isClearance ? "text-member-text" : "text-text-primary"
                        }`}
                      >
                        {isClearance && <Star className="h-4 w-4 fill-current" />}
                        {label}
                      </Link>
                      {hasChildren && (
                        <button
                          onClick={() => setExpanded(expanded === key ? null : key)}
                          aria-label={`Expand ${label}`}
                          aria-expanded={expanded === key}
                          className="px-4 py-3.5 text-text-secondary"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${expanded === key ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {expanded === key && childLinks.length > 0 && (
                      <div className="bg-steel-50 pb-2">
                        {childLinks.map((child) => (
                          <Link
                            key={child.key}
                            href={child.href}
                            target={child.newTab ? "_blank" : undefined}
                            onClick={close}
                            className={
                              child.heading
                                ? "block px-6 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-text-secondary"
                                : "block px-6 py-2.5 text-sm text-ink-700 hover:text-accent"
                            }
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
