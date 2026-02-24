import Link from "next/link";

export function Footer({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-zinc-900">{storeName}</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Quality products for your needs.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Shop</h4>
            <ul className="mt-2 space-y-2">
              <li><Link href="/products" className="text-sm text-zinc-500 hover:text-zinc-900">All Products</Link></li>
              <li><Link href="/categories" className="text-sm text-zinc-500 hover:text-zinc-900">Categories</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Account</h4>
            <ul className="mt-2 space-y-2">
              <li><Link href="/account" className="text-sm text-zinc-500 hover:text-zinc-900">My Account</Link></li>
              <li><Link href="/account/orders" className="text-sm text-zinc-500 hover:text-zinc-900">Order History</Link></li>
              <li><Link href="/cart" className="text-sm text-zinc-500 hover:text-zinc-900">Cart</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Support</h4>
            <ul className="mt-2 space-y-2">
              <li><Link href="/contact" className="text-sm text-zinc-500 hover:text-zinc-900">Contact Us</Link></li>
              <li><Link href="/shipping" className="text-sm text-zinc-500 hover:text-zinc-900">Shipping Info</Link></li>
              <li><Link href="/returns" className="text-sm text-zinc-500 hover:text-zinc-900">Returns</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-zinc-200 pt-8 text-center text-sm text-zinc-400">
          &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
