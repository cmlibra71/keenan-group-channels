import Link from "next/link";
import { ShoppingCart, Search, Menu } from "lucide-react";

export function Header({ storeName }: { storeName: string }) {
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
            <Link href="/cart" className="text-zinc-600 hover:text-zinc-900">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            <Link href="/account" className="hidden sm:block text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Account
            </Link>
            <button className="md:hidden text-zinc-600">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
