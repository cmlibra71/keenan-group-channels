import Link from "next/link";
import Image from "next/image";
import { Search, Crown } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscriptionForContact, getFeatureFlag, getMegaMenu, getHeaderNav, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { HeaderPanels } from "./HeaderPanels";
import { MegaMenu } from "./MegaMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";

type NavCategory = { id: number; name: string; slug: string };

export async function Header({
  storeName,
  logoUrl,
  logoAlt,
  navCategories = [],
}: {
  storeName: string;
  logoUrl?: string | null;
  logoAlt?: string | null;
  navCategories?: NavCategory[];
}) {
  // The Header renders in the root layout — ABOVE the page's error boundary — so
  // any throw here escalates to the site-wide global-error page ("Something went
  // wrong loading the site"), and it re-runs on every refresh()
  // from a cart/quote mutation. Degrade gracefully (empty badge / nav) on a
  // transient DB failure instead of taking down the whole storefront.
  const [cart, quote, megaMenu, headerNav] = await Promise.all([
    getCart().catch(() => null),
    getQuote().catch(() => null),
    getMegaMenu().catch(() => ({ departments: [], featured: {} })),
    getHeaderNav().catch(() => []),
  ]);
  const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  // QuoteService.getWithItems types its items loosely (Record<string,unknown>) unlike
  // CartService — precise typing there is a separate cleanup. quantity is runtime-correct.
  const quoteCount = quote?.items.reduce((sum, item) => sum + (item.quantity as number), 0) ?? 0;

  let isMember = false;
  let entryCount = 0;
  // The header's prize-draw badge (crown + entry count) is gated on the SAME
  // draws_enabled channel flag as every other draw surface, so switching draws
  // on/off in channel settings switches the badge with them. Membership itself
  // still keys off subscriptions_enabled — that is what drives the "Membership"
  // nav link below. getFeatureFlag swallows its own errors and returns false, so
  // a transient DB failure hides the badge rather than taking the storefront down.
  const [subscriptionsEnabled, drawsEnabled] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
  ]);
  if (subscriptionsEnabled) {
    const session = await getSession().catch(() => null);
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId).catch(() => null);
      isMember = !!activeSub;
      if (isMember && drawsEnabled) {
        type DrawEntry = {
          entry: { id: number; entryCount: number | null; status: string };
        };
        const entries = await drawEntryService.getEntriesForContact(session.contactId, CHANNEL_ID).catch(() => []) as DrawEntry[];
        entryCount = entries
          .filter((e) => e.entry.status === "active")
          .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
      }
    }
  }

  return (
    <>
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            {logoUrl ? (
              <Link href="/">
                <Image src={logoUrl} alt={logoAlt || storeName} height={40} width={160} className="object-contain" />
              </Link>
            ) : (
              <Link href="/" className="text-xl font-bold text-zinc-900">
                {storeName}
              </Link>
            )}

            {/* Navigation — portal-managed links (Storefront > Navigation) when
                configured, else channel categories, else static fallbacks. */}
            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              {headerNav.length > 0 ? (
                headerNav.map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className="text-sm font-medium text-zinc-600 hover:text-zinc-900 whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                ))
              ) : navCategories.length > 0 ? (
                navCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories/${cat.slug}`}
                    className="text-sm font-medium text-zinc-600 hover:text-zinc-900 whitespace-nowrap"
                  >
                    {cat.name}
                  </Link>
                ))
              ) : (
                <>
                  <Link href="/products" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
                    Products
                  </Link>
                  <Link href="/categories" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
                    Categories
                  </Link>
                </>
              )}
              <Link href="/brands" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
                Brands
              </Link>
              {subscriptionsEnabled && !isMember && (
                <Link
                  href="/membership"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Membership
                </Link>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Link href="/search" className="text-zinc-600 hover:text-zinc-900">
                <Search className="h-5 w-5" />
              </Link>
              <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} drawsEnabled={drawsEnabled} />
              <MobileNavDrawer departments={megaMenu.departments} />
            </div>
          </div>
        </div>

        {/* Department nav + mega panels — dark bar below the masthead */}
        <MegaMenu departments={megaMenu.departments} featured={megaMenu.featured} />
      </header>

      {/* The header's slide-out panels — rendered ONCE, outside <header>, so
          exactly one is ever visible and none inherits a breakpoint-hidden
          wrapper. */}
      <HeaderPanels />
    </>
  );
}
