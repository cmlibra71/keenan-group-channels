import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscriptionForContact, getFeatureFlag, getMegaMenu, getHeaderNav, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { HeaderPanels } from "./HeaderPanels";
import { GstToggle } from "./GstToggle";
import { MegaMenu } from "./MegaMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { SearchTypeahead } from "../search/SearchTypeahead";

/**
 * Design-system header: Green-500 masthead (white logo, centred glass
 * search, GST switch, quote/cart/account) over the Green-700 nav bar with
 * mega panels. Sticky as a unit.
 */
export async function Header({ storeName, logoUrl, logoAlt }: { storeName: string; logoUrl?: string | null; logoAlt?: string | null }) {
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
  const subscriptionsEnabled = await getFeatureFlag("subscriptions_enabled");
  if (subscriptionsEnabled) {
    const session = await getSession().catch(() => null);
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId).catch(() => null);
      isMember = !!activeSub;
      if (isMember) {
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
      <header className="sticky top-0 z-[100]">
        {/* Masthead — brand green */}
        <div className="bg-brand">
          <div className="container-page">
            <div className="flex h-[72px] items-center gap-5 lg:h-[78px] lg:gap-6">
              <MobileNavDrawer departments={megaMenu.departments} />

              {/* Logo — white wordmark on green (design-system asset) */}
              <Link href="/" className="shrink-0" aria-label={storeName}>
                <Image
                  src="/brand/chefs-depot-logo-white.png"
                  alt={logoAlt || storeName}
                  height={48}
                  width={166}
                  priority
                  className="h-9 w-auto object-contain lg:h-12"
                />
              </Link>

              {/* Search — centred glass pill (design .cd-search) */}
              <div className="hidden flex-1 justify-center md:flex">
                <div className="w-full max-w-[560px]">
                  <SearchTypeahead inline variant="masthead" />
                </div>
              </div>

              {/* Actions */}
              <div className="ml-auto flex items-center gap-5">
                <GstToggle className="hidden md:inline-flex" />
                <Link href="/search" className="md:hidden text-white transition-colors duration-200 hover:text-white/80" aria-label="Search">
                  <Search className="h-[22px] w-[22px]" strokeWidth={1.7} />
                </Link>
                <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} />
              </div>
            </div>
          </div>
        </div>

        {/* Department nav — editor items (incl. mega-menu department items) when
            set, else the bar's built-in default */}
        <MegaMenu departments={megaMenu.departments} featured={megaMenu.featured} items={headerNav} />
      </header>

      {/* The header's slide-out panels — rendered ONCE, outside <header>, so
          exactly one is ever visible and none inherits a breakpoint-hidden
          wrapper. */}
      <HeaderPanels />
    </>
  );
}
