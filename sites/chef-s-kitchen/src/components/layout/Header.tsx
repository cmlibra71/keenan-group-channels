import Link from "next/link";
import { Search, Menu, Crown } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { getSession } from "@/lib/auth";
import { getActiveSubscription, getFeatureFlag, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { HeaderClient } from "./HeaderClient";

export async function Header({ storeName }: { storeName: string }) {
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
    <header className="bg-white/80 backdrop-blur-md border-b border-stone sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-[4.5rem] items-center justify-between">
          {/* Logo — serif wordmark */}
          <Link href="/" className="heading-serif text-2xl text-navy hover:text-teal transition-colors duration-300">
            {storeName}
          </Link>

          {/* Navigation — understated, uppercase sans */}
          <nav className="hidden md:flex items-center gap-10">
            <Link href="/products" className="heading-sans text-ink-light hover:text-navy transition-colors duration-300">
              Products
            </Link>
            <Link href="/categories" className="heading-sans text-ink-light hover:text-navy transition-colors duration-300">
              Categories
            </Link>
            {subscriptionsEnabled && !isMember && (
              <Link
                href="/membership"
                className="inline-flex items-center gap-1.5 heading-sans text-teal hover:text-teal-dark transition-colors duration-300"
              >
                <Crown className="h-3 w-3" />
                Membership
              </Link>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-5">
            <Link href="/search" className="text-ink-light hover:text-navy transition-colors duration-300">
              <Search className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
            </Link>
            <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} />
            <button className="md:hidden text-ink-light hover:text-navy transition-colors duration-300">
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
