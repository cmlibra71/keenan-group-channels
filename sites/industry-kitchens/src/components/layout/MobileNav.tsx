"use client";

import { useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";

// The account / shopping links this panel offers.
const ACCOUNT_LINKS: { label: string; href: string }[] = [
  { label: "Login", href: "/account" },
  { label: "Register", href: "/account/register" },
  { label: "Re-Order", href: "/account/orders" },
  { label: "My Account", href: "/account" },
  { label: "My Quotes", href: "/account/quotes" },
  { label: "My Cart", href: "/cart" },
  { label: "Checkout", href: "/checkout" },
];

/**
 * The sub-desktop ACCOUNT panel.
 *
 * It used to open with a copy of the Navigation editor's header links above
 * these — but the hamburger sitting immediately to its left (MobileNavDrawer)
 * now mirrors the department bar item for item, editor items included (card
 * mOTgYEvX), so the two panels listed the same links and two identical
 * hamburgers stood side by side. Categories belong to that drawer; this one
 * keeps the account and shopping links and wears the person icon.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="p-2 text-zinc-700" aria-label="Open account menu">
        <User className="h-5 w-5" />
      </button>

      <SlidePanel isOpen={open} onClose={close} title="Account">
        <div className="p-4">
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
