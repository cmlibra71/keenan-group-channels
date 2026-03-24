import Link from "next/link";

export function Footer({ storeName, subscriptionsEnabled }: { storeName: string; subscriptionsEnabled?: boolean }) {
  return (
    <footer className="border-t border-stone bg-white mt-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand column */}
          <div className="md:col-span-4">
            <h3 className="heading-serif text-xl text-navy">{storeName}</h3>
            <p className="mt-3 text-sm text-ink-light leading-relaxed max-w-xs">
              Professional-grade kitchen equipment and supplies for the commercial trade.
            </p>
          </div>

          {/* Link columns */}
          <div className="md:col-span-8">
            <div className={`grid grid-cols-2 gap-8 ${subscriptionsEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <div>
                <h4 className="heading-sans text-ink tracking-widest mb-4">Shop</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/products" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">All Products</Link></li>
                  <li><Link href="/categories" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Categories</Link></li>
                </ul>
              </div>
              {subscriptionsEnabled && (
                <div>
                  <h4 className="heading-sans text-ink tracking-widest mb-4">Membership</h4>
                  <ul className="space-y-2.5">
                    <li><Link href="/membership" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Join</Link></li>
                    <li><Link href="/membership#savings" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Member Benefits</Link></li>
                    <li><Link href="/membership#draws" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Prize Draws</Link></li>
                    <li><Link href="/account/partner-offers" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Partner Offers</Link></li>
                  </ul>
                </div>
              )}
              <div>
                <h4 className="heading-sans text-ink tracking-widest mb-4">Account</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/account" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">My Account</Link></li>
                  <li><Link href="/account/orders" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Order History</Link></li>
                  <li><Link href="/cart" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Cart</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="heading-sans text-ink tracking-widest mb-4">Support</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/contact" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Contact Us</Link></li>
                  <li><Link href="/shipping" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Shipping Info</Link></li>
                  <li><Link href="/returns" className="text-sm text-ink-light hover:text-navy transition-colors duration-300">Returns</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="divider mt-12" />
        <div className="pt-8 text-center">
          <p className="text-xs text-ink-faint tracking-wide">
            &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
