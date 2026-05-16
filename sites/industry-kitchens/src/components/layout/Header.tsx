import Link from "next/link";
import Image from "next/image";
import { Phone, Mail, ChevronDown } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscription, getFeatureFlag, drawEntryService, CHANNEL_ID } from "@/lib/store";
import type { HeaderNavItem, HeaderConfig } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { HeaderSearch } from "./HeaderSearch";
import { MobileNav } from "./MobileNav";

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
  const [cart, quote] = await Promise.all([getCart(), getQuote()]);
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
        const entries = (await drawEntryService.getEntriesForCustomer(
          session.customerId,
          CHANNEL_ID
        )) as DrawEntry[];
        entryCount = entries
          .filter((e) => e.entry.status === "active")
          .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
      }
    }
  }

  const phone = config.phone;
  const phoneHref = phone ? `tel:+61${phone.replace(/\D/g, "").replace(/^0/, "")}` : undefined;

  return (
    <header className="bg-white sticky top-0 z-50 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
      {/* Utility row — logo, search, account/quote/cart, contact buttons */}
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
                  className="h-11 lg:h-14 w-auto object-contain"
                />
              ) : (
                <span className="text-xl font-bold text-[#D94B2B]">{storeName}</span>
              )}
            </Link>

            {/* Search with live suggestions */}
            <HeaderSearch placeholder={config.search_placeholder || `Search ${storeName}`} />

            {/* Account / GST / Quote / Cart */}
            <div className="hidden lg:flex items-center gap-4 shrink-0">
              {config.gst_label && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 whitespace-nowrap">
                  {config.gst_label}
                  <ChevronDown className="h-3 w-3" />
                </span>
              )}
              <HeaderClient
                cartCount={cartCount}
                quoteCount={quoteCount}
                isMember={isMember}
                entryCount={entryCount}
              />
            </div>

            {/* Contact buttons */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Link
                href="/pages/contact"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#D94B2B] px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#C73629] transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Contact Us
              </Link>
              {phoneHref && (
                <a
                  href={phoneHref}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#D94B2B] px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#C73629] transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{phone}</span>
                  <span className="xl:hidden">Phone</span>
                </a>
              )}
            </div>

            {/* Mobile: cart + menu */}
            <div className="flex lg:hidden items-center gap-1 ml-auto shrink-0">
              <HeaderClient
                cartCount={cartCount}
                quoteCount={quoteCount}
                isMember={isMember}
                entryCount={entryCount}
                compact
              />
              <MobileNav nav={nav} searchPlaceholder={config.search_placeholder} />
            </div>
          </div>
        </div>
      </div>

      {/* Primary navigation row */}
      {nav.length > 0 && (
        <div className="hidden lg:block border-b border-zinc-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-6 xl:gap-8 py-2.5">
              {nav.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="text-[13px] font-semibold text-zinc-700 hover:text-[#D94B2B] whitespace-nowrap transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
