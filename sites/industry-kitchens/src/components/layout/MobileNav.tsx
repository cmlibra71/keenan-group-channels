"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";
import type { HeaderNavItem } from "@/lib/store";

export function MobileNav({
  nav,
  searchPlaceholder,
}: {
  nav: HeaderNavItem[];
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-zinc-700"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <SlidePanel isOpen={open} onClose={() => setOpen(false)} title="Menu">
        <div className="p-4">
          <form action="/search" className="flex mb-4" onSubmit={() => setOpen(false)}>
            <input
              type="search"
              name="q"
              placeholder={searchPlaceholder || "Search"}
              aria-label="Search"
              className="min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-[#D94B2B]"
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex items-center justify-center rounded-r-md bg-[#D94B2B] px-3 text-white"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
          <nav className="flex flex-col">
            {nav.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 border-b border-zinc-100 text-sm font-semibold text-zinc-800 hover:text-[#D94B2B]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </SlidePanel>
    </>
  );
}
