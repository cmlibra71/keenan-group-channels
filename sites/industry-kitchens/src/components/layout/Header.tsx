import Link from "next/link";
import Image from "next/image";
import { Phone, Mail } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscriptionForContact, getFeatureFlag, getMegaMenu, drawEntryService, CHANNEL_ID } from "@/lib/store";
import type { HeaderNavItem, HeaderConfig } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { HeaderPanels } from "./HeaderPanels";
import { HeaderSearch } from "./HeaderSearch";
import { GstToggle } from "./GstToggle";
import { MobileNav } from "./MobileNav";
import { MegaMenu } from "./MegaMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";

export async function Header({
  storeName,
  logoUrl,
  logoAlt,
  nav = [],
  config = {},
}: {
  storeName: string;
  logoUrl?: string | null;
  logoAlt?: string | null;
  nav?: HeaderNavItem[];
  config?: HeaderConfig;
}) {
  // The Header renders in the root layout — ABOVE the page's error boundary — so
  // any throw here escalates to the site-wide global-error page ("Something went
  // wrong loading the site"), and it re-runs on every refresh()
  // from a cart/quote mutation. Degrade gracefully (empty badge / nav) on a
  // transient DB failure instead of taking down the whole storefront.
  const [cart, quote, megaMenu] = await Promise.all([
    getCart().catch(() => null),
    getQuote().catch(() => null),
    getMegaMenu().catch(() => ({ departments: [], featured: {} })),
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
  // still keys off subscriptions_enabled, so the "Account" vs "Sign In/Register"
  // label is unchanged. getFeatureFlag swallows its own errors and returns
  // false, so a transient DB failure hides the badge rather than taking the
  // storefront down.
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
        const entries = (await drawEntryService
          .getEntriesForContact(session.contactId, CHANNEL_ID)
          .catch(() => [])) as DrawEntry[];
        entryCount = entries
          .filter((e) => e.entry.status === "active")
          .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
      }
    }
  }

  const phone = config.phone;
  const phoneHref = phone ? `tel:+61${phone.replace(/\D/g, "").replace(/^0/, "")}` : undefined;

  const searchPlaceholder = config.search_placeholder || `Search ${storeName}`;

  return (
    <>
      <header className="bg-white sticky top-0 z-50 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        {/* Utility row — logo, search (xl), account cluster (xl), compact icons (sub-xl) */}
        <div className="border-b border-zinc-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:gap-6 py-3">
              {/* Logo */}
              <Link href="/" className="shrink-0">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt={logoAlt || storeName}
                    width={188}
                    height={64}
                    priority
                    className="h-11 xl:h-14 w-auto object-contain"
                  />
                ) : (
                  <span className="text-xl font-bold text-[#D94B2B]">{storeName}</span>
                )}
              </Link>

              {/* Search — inline on desktop */}
              <HeaderSearch
                placeholder={searchPlaceholder}
                className="hidden xl:block flex-1 max-w-3xl"
              />

              {/* Account / GST / Quote / Cart — desktop */}
              <div className="hidden xl:flex items-center gap-4 shrink-0">
                <GstToggle />
                <HeaderClient
                  cartCount={cartCount}
                  quoteCount={quoteCount}
                  isMember={isMember}
                  entryCount={entryCount}
                  drawsEnabled={drawsEnabled}
                />
              </div>

              {/* Compact (sub-desktop): phone + quote/cart + menu */}
              <div className="flex xl:hidden items-center gap-0.5 ml-auto shrink-0">
                {phoneHref && (
                  <a href={phoneHref} aria-label="Call us" className="p-2 text-[#D94B2B]">
                    <Phone className="h-5 w-5" />
                  </a>
                )}
                <HeaderClient
                  cartCount={cartCount}
                  quoteCount={quoteCount}
                  isMember={isMember}
                  entryCount={entryCount}
                  drawsEnabled={drawsEnabled}
                  variant="compact"
                />
                <span className="p-2 text-zinc-700 xl:hidden">
                  <MobileNavDrawer departments={megaMenu.departments} />
                </span>
                <MobileNav nav={nav} />
              </div>
            </div>
          </div>
        </div>

        {/* Sub-desktop search row */}
        <div className="xl:hidden border-b border-zinc-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5">
            <HeaderSearch placeholder={searchPlaceholder} className="block w-full" />
          </div>
        </div>

        {/* Sub-desktop GST + sign-in row */}
        <div className="xl:hidden border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-1.5">
              <GstToggle />
              <HeaderClient
                cartCount={cartCount}
                quoteCount={quoteCount}
                isMember={isMember}
                entryCount={entryCount}
                drawsEnabled={drawsEnabled}
                variant="account"
              />
            </div>
          </div>
        </div>

        {/* Navigation row — nav links and contact buttons share one row */}
        <div className="hidden xl:block border-b border-zinc-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4 py-2">
              <nav className="flex items-center gap-x-4 2xl:gap-x-6">
                {nav.map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className="text-[11px] font-semibold text-zinc-700 hover:text-[#D94B2B] whitespace-nowrap transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/pages/contact"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#D94B2B] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[#C73629] transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Contact Us
                </Link>
                {phoneHref && (
                  <a
                    href={phoneHref}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#D94B2B] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[#C73629] transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Department nav + mega panels — dark bar below the nav row */}
        <MegaMenu departments={megaMenu.departments} featured={megaMenu.featured} />
      </header>

      {/* The header's slide-out panels — rendered ONCE here, NOT inside
          HeaderClient (which renders three times for three breakpoints) and NOT
          inside any hidden xl:* wrapper, so exactly one panel is ever visible
          and it is visible at every width. */}
      <HeaderPanels />
    </>
  );
}
