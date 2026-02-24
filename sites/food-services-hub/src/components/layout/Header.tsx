import Link from "next/link";
import { Search, Menu } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getQuote } from "@/lib/actions/quote";
import { HeaderClient } from "./HeaderClient";

export async function Header({ storeName }: { storeName: string }) {
  const [cart, quote] = await Promise.all([getCart(), getQuote()]);
  const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const quoteCount = quote?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

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
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Link href="/search" className="text-zinc-600 hover:text-zinc-900">
              <Search className="h-5 w-5" />
            </Link>
            <HeaderClient cartCount={cartCount} quoteCount={quoteCount} />
            <button className="md:hidden text-zinc-600">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
