import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscriptionForContact, getFeatureFlag, getMegaMenu, getHeaderNav, getMegaMenuHidden, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { HeaderPanels } from "./HeaderPanels";
import { MegaMenu } from "./MegaMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { SearchTypeahead } from "../search/SearchTypeahead";

/**
 * Design-system header: Green-500 masthead (white logo, centred glass
 * search, quote/cart/account) over the Green-700 nav bar with
 * mega panels. Sticky as a unit.
 */
export async function Header({ storeName, logoUrl, logoAlt }: { storeName: string; logoUrl?: string | null; logoAlt?: string | null }) {
  // The Header renders in the root layout — ABOVE the page's error boundary — so
  // any throw here escalates to the site-wide global-error page ("Something went
  // wrong loading the site"), and it re-runs on every refresh()
  // from a cart/quote mutation. Degrade gracefully (empty badge / nav) on a
  // transient DB failure instead of taking down the whole storefront.
  const [cart, quote, megaMenu, headerNav, hiddenDepartments] = await Promise.all([
    getCart().catch(() => null),
    getQuote().catch(() => null),
    getMegaMenu().catch(() => ({ departments: [], featured: {} })),
    getHeaderNav().catch(() => []),
    getMegaMenuHidden().catch(() => []),
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
  // still keys off subscriptions_enabled — the member state is used for nothing
  // else in this header today, but keeping it intact keeps the two concerns
  // separate. getFeatureFlag swallows its own errors and returns false, so a
  // transient DB failure hides the badge rather than taking the storefront down.
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
      <header className="sticky top-0 z-[100]">
        {/* Masthead — brand green */}
        <div className="bg-brand">
          <div className="container-page">
            {/* min-height, not height: the masthead GROWS to hold the logo
                rather than cropping or squashing the lockup. 72/78px stays the
                FLOOR so a small logo leaves the bar as it was — with the 150px
                box below (card bf2w6JFe) the bar settles at 166px on desktop
                instead of the 331px Tim called too large. */}
            <div className="flex min-h-[72px] items-center gap-5 py-2 lg:min-h-[78px] lg:gap-6">
              <MobileNavDrawer
                departments={megaMenu.departments}
                items={headerNav}
                hiddenCategoryIds={hiddenDepartments}
              />

              {/* Logo — the portal's Storefront > Logo setting when one is set
                  (same shape as Industry Kitchens), else the bundled white
                  wordmark that the design system draws on green. The masthead
                  is dark, so a logo uploaded on a solid light background shows
                  as a light block here; that is the uploaded asset, not this
                  fallback.

                  SIZED TO A 150px SQUARE BOX from `sm` up (card bf2w6JFe, Tim
                  2026-08-23: "the logo at the top of Chefs Depot is now too
                  large, can we change it to 150px square"). This SUPERSEDES the
                  350px-wide sizing of card kiJa7dug ON CHEFS DEPOT ONLY —
                  Industry Kitchens keeps 350px, so do not "restore parity" by
                  copying either header onto the other. `object-contain` keeps
                  the artwork's own aspect ratio inside the box, so a stacked
                  lockup letterboxes against the green rather than being
                  stretched or cropped; the box is square because the setting
                  can hold any shape of artwork and 150 is the cap in BOTH
                  directions. The width/height props are only Next's pre-load
                  hint and its srcSet basis; the loaded image's own ratio wins.

                  Below `sm` the sizing is UNCHANGED from kiJa7dug —
                  `w-[min(150px,25vw)]` with `h-auto`, deliberately not the
                  square box. This Link is `shrink-0`, so on a 320px-wide screen
                  (iPhone SE / a 640px window at 200% zoom) a flat 150px logo
                  pushed the CART control off the right edge — and
                  `html,body{overflow-x:hidden}` meant the shopper could not
                  scroll to it. `max-w-full` does NOT catch that: it resolves
                  against a shrink-wrapped parent, so it constrains nothing. The
                  vw term is what makes the logo give width back at the
                  responsive floor, and `h-auto` keeps the phone bar short.
                  Re-measure the cart's right edge at 320px before raising it. */}
              <Link href="/" className="shrink-0" aria-label={storeName}>
                <Image
                  src={logoUrl || "/brand/chefs-depot-logo-white.png"}
                  alt={logoAlt || storeName}
                  height={269}
                  width={350}
                  priority
                  className="h-auto w-[min(150px,25vw)] max-w-full object-contain sm:h-[150px] sm:w-[150px]"
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
                <Link href="/search" className="md:hidden text-white transition-colors duration-200 hover:text-white/80" aria-label="Search">
                  <Search className="h-[22px] w-[22px]" strokeWidth={1.7} />
                </Link>
                <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} drawsEnabled={drawsEnabled} />
              </div>
            </div>
          </div>
        </div>

        {/* Department nav — every department by default, in the editor's order,
            minus the ones switched off (card 9wau4Tx9) */}
        <MegaMenu
          departments={megaMenu.departments}
          featured={megaMenu.featured}
          items={headerNav}
          hiddenCategoryIds={hiddenDepartments}
        />
      </header>

      {/* The header's slide-out panels — rendered ONCE, outside <header>, so
          exactly one is ever visible and none inherits a breakpoint-hidden
          wrapper. */}
      <HeaderPanels />
    </>
  );
}
