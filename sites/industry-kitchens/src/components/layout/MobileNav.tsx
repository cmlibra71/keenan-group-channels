"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";
import type { HeaderNavItem } from "@/lib/store";

// Standard account/shopping links shown below the categories in the drawer.
const ACCOUNT_LINKS: { label: string; href: string }[] = [
  { label: "Login", href: "/account" },
  { label: "Register", href: "/account/register" },
  { label: "Re-Order", href: "/account/orders" },
  { label: "My Account", href: "/account" },
  { label: "My Quotes", href: "/account/quotes" },
  { label: "My Cart", href: "/cart" },
  { label: "Checkout", href: "/checkout" },
];

export function MobileNav({ nav }: { nav: HeaderNavItem[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="p-2 text-zinc-700" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <SlidePanel isOpen={open} onClose={close} title="Menu">
        <div className="p-4">
          {/* Categories */}
          <nav className="flex flex-col">
            {nav.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={close}
                className="py-3 border-b border-zinc-100 text-sm font-semibold text-zinc-800 hover:text-[#D94B2B]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Break */}
          <div className="my-4 border-t-2 border-zinc-200" />

          {/* Account / shopping links */}
          <nav className="flex flex-col">
            {ACCOUNT_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={close}
                className="py-3 border-b border-zinc-100 text-sm font-medium text-zinc-600 hover:text-[#D94B2B]"
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
