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
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold text-zinc-900">
            {storeName}
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/products" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Products
            </Link>
            <Link href="/categories" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Categories
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
            <HeaderClient cartCount={cartCount} quoteCount={quoteCount} isMember={isMember} entryCount={entryCount} />
            <button className="md:hidden text-zinc-600">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
