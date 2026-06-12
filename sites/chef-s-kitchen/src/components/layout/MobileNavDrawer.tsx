"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, Star } from "lucide-react";
import type { MegaMenuNode } from "@/lib/store";

/**
 * Below lg the nav becomes a hamburger → full-height drawer with accordion
 * departments (design-system mobile pattern).
 */
export function MobileNavDrawer({ departments }: { departments: MegaMenuNode[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden text-white/90 hover:text-white transition-colors duration-200"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-lg">
            <div className="flex items-center justify-between bg-brand px-4 py-4">
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                Departments
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-white/90 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {departments.map((dept) => (
                <div key={dept.id} className="border-b border-border">
                  <div className="flex items-center">
                    <Link
                      href={`/categories/${dept.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex-1 px-4 py-3.5 text-sm font-semibold text-text-primary"
                    >
                      {dept.name}
                    </Link>
                    {dept.children.length > 0 && (
                      <button
                        onClick={() => setExpanded(expanded === dept.id ? null : dept.id)}
                        aria-label={`Expand ${dept.name}`}
                        aria-expanded={expanded === dept.id}
                        className="px-4 py-3.5 text-text-secondary"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${expanded === dept.id ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                  {expanded === dept.id && (
                    <div className="bg-steel-50 pb-2">
                      {dept.children.map((group) => (
                        <Link
                          key={group.id}
                          href={`/categories/${group.slug}`}
                          onClick={() => setOpen(false)}
                          className="block px-6 py-2.5 text-sm text-ink-700 hover:text-accent"
                        >
                          {group.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <Link
                href="/clearance"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-3.5 text-sm font-bold text-member-text"
              >
                <Star className="h-4 w-4 fill-current" />
                Last Units
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
