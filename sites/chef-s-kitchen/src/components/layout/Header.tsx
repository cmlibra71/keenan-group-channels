import Link from "next/link";
import Image from "next/image";
import { Menu, Crown, Search } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscription, getFeatureFlag, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";
import { SearchTypeahead } from "../search/SearchTypeahead";

export async function Header({ storeName, logoUrl, logoAlt }: { storeName: string; logoUrl?: string | null; logoAlt?: string | null }) {
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
        const entries = await drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID) as DrawEntry[];
        entryCount = entries
          .filter((e) => e.entry.status === "active")
          .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
      }
    }
  }

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
      <div className="container-page">
        <div className="flex h-[4.5rem] items-center justify-between">
          {/* Logo */}
          {logoUrl ? (
            <Link href="/">
              <Image src={logoUrl} alt={logoAlt || storeName} height={40} width={160} className="object-contain" />
            </Link>
          ) : (
            <Link href="/" className="heading-serif text-2xl text-text-primary hover:text-accent transition-colors duration-300">
              {storeName}
            </Link>
          )}

          {/* Search bar — centered */}
          <div className="hidden md:flex flex-1 justify-center mx-8">
            <div className="w-full max-w-md">
              <SearchTypeahead inline />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-5">
            <Link href="/search" className="md:hidden text-text-secondary hover:text-text-primary transition-colors duration-300">
              <Search className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
            </Link>
            <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} />
            <button className="md:hidden text-text-secondary hover:text-text-primary transition-colors duration-300">
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Sub-nav — centered menu items */}
        {subscriptionsEnabled && !isMember && (
          <nav className="hidden md:flex justify-center pb-2">
            <Link
              href="/membership"
              className="inline-flex items-center gap-1.5 nav-link-accent"
            >
              <Crown className="h-3 w-3" />
              Membership
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
