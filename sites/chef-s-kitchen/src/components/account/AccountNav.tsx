"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  User,
  KeyRound,
  Package,
  FileText,
  Headset,
  Crown,
  Trophy,
  Gift,
  ShoppingBag,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  isAccountNavItemCurrent,
  type AccountNavItem,
} from "@/lib/account/account-nav-items";
import { logout } from "@/lib/actions/auth";

/**
 * The account menu, Chef's Depot dress.
 *
 * WHICH items exist is decided by the shared pure module — this component only
 * decides how they look and which one is lit. Two presentations of the same list:
 * a sticky column from `lg` up, and a disclosure above the content below it. The
 * small-screen form is a disclosure rather than a drawer on purpose — it must
 * never push the page sideways, and a customer on a phone reading their quote
 * should be able to reach the menu without the page moving under them.
 */

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  profile: User,
  security: KeyRound,
  orders: Package,
  quotes: FileText,
  contact: Headset,
  membership: Crown,
  draws: Trophy,
  partnerOffers: Gift,
  shop: ShoppingBag,
  signout: LogOut,
};

const ROW_BASE =
  "flex items-center gap-3 px-3 py-2.5 text-sm w-full text-left transition-colors duration-200";
const ROW_IDLE = "text-text-secondary hover:bg-surface-secondary hover:text-text-primary";
const ROW_CURRENT = "bg-surface-secondary text-text-primary font-semibold";

function NavRows({
  items,
  pathname,
  onNavigate,
}: {
  items: AccountNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.key] ?? FileText;

        if (!item.href) {
          // Sign Out is an action, not a destination: it posts the logout server action.
          return (
            <form key={item.key} action={logout}>
              <button type="submit" className={`${ROW_BASE} ${ROW_IDLE}`}>
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            </form>
          );
        }

        const current = isAccountNavItemCurrent(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={`${ROW_BASE} ${current ? ROW_CURRENT : ROW_IDLE}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AccountNav({ items }: { items: AccountNavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav aria-label="Account" className="lg:w-60 lg:shrink-0">
      {/* Phone / tablet: a disclosure that expands in flow above the content. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="account-nav-panel"
          className="flex w-full items-center justify-between border border-border bg-white px-4 py-3 text-sm font-semibold text-text-primary"
        >
          <span className="flex items-center gap-2">
            <Menu className="h-4 w-4" />
            Account menu
          </span>
          {open && <X className="h-4 w-4 text-text-secondary" />}
        </button>
        {open && (
          <div
            id="account-nav-panel"
            className="border border-t-0 border-border bg-white py-2"
          >
            <NavRows items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>

      {/* Desktop: a sticky column beside the content. */}
      <div className="hidden lg:block lg:sticky lg:top-24">
        <div className="border border-border bg-white py-2">
          <NavRows items={items} pathname={pathname} />
        </div>
      </div>
    </nav>
  );
}
