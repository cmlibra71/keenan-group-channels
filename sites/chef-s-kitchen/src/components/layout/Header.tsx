import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscription, getFeatureFlag, getMegaMenu, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
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
  const [cart, quote, megaMenu] = await Promise.all([getCart(), getQuote(), getMegaMenu()]);
  const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const quoteCount = quote?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  let isMember = false;
  let entryCount = 0;
  const subscriptionsEnabled = await getFeatureFlag("subscriptions_enabled");
  if (subscriptionsEnabled) {
    const session = await getSession();
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      isMember = !!activeSub;
      if (isMember) {
        type DrawEntry = {
          entry: { id: number; entryCount: number | null; status: string };
        };
        const entries = await drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID) as DrawEntry[];
        entryCount = entries
          .filter((e) => e.entry.status === "active")
          .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
      }
    }
  }

  return (
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

            {/* Search — centred glass field */}
            <div className="hidden flex-1 justify-center md:flex">
              <div className="w-full max-w-xl [&_input]:rounded-btn [&_input]:border-white/25 [&_input]:bg-white/15 [&_input]:text-white [&_input]:placeholder-white/60 [&_input]:focus:border-white/60 [&_input]:focus:ring-white/40 [&_svg]:!text-white/60">
                <SearchTypeahead inline />
              </div>
            </div>

            {/* Actions */}
            <div className="ml-auto flex items-center gap-5">
              <GstToggle className="hidden md:inline-flex" />
              <Link href="/search" className="md:hidden text-white/90 transition-colors duration-200 hover:text-white" aria-label="Search">
                <Search className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.8} />
              </Link>
              <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} />
            </div>
          </div>
        </div>
      </div>

      {/* Department nav + mega panels — deep green */}
      <MegaMenu departments={megaMenu.departments} featured={megaMenu.featured} />
    </header>
  );
}
