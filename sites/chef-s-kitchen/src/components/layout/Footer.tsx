import Link from "next/link";
import Image from "next/image";

/**
 * Design-system footer: white logo on warm ink, brand blurb + link columns,
 * legal bottom bar. Collapses to stacked columns on mobile.
 */
export function Footer({ storeName, subscriptionsEnabled }: { storeName: string; subscriptionsEnabled?: boolean }) {
  return (
    <footer className="mt-20 bg-surface-dark text-white">
      <div className="container-page py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand column */}
          <div className="md:col-span-4">
            <Image
              src="/brand/chefs-depot-logo-white.png"
              alt={storeName}
              height={56}
              width={194}
              className="h-12 w-auto object-contain"
            />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
              Professional-grade kitchen equipment and supplies for the
              commercial trade. Wholesale pricing for members.
            </p>
          </div>

          {/* Link columns */}
          <div className="md:col-span-8">
            <div className={`grid grid-cols-2 gap-8 ${subscriptionsEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <div>
                <h4 className="heading-sans mb-4 text-white/85">Shop</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/products" className="footer-link">All Products</Link></li>
                  <li><Link href="/categories" className="footer-link">Categories</Link></li>
                  <li><Link href="/brands" className="footer-link">Brands</Link></li>
                  <li><Link href="/clearance" className="footer-link">Clearance</Link></li>
                </ul>
              </div>
              {subscriptionsEnabled && (
                <div>
                  <h4 className="heading-sans mb-4 text-white/85">Membership</h4>
                  <ul className="space-y-2.5">
                    <li><Link href="/membership" className="footer-link">Join</Link></li>
                    <li><Link href="/membership#savings" className="footer-link">Member Benefits</Link></li>
                    <li><Link href="/membership" className="footer-link">Prize Draws</Link></li>
                    <li><Link href="/account/partner-offers" className="footer-link">Partner Offers</Link></li>
                  </ul>
                </div>
              )}
              <div>
                <h4 className="heading-sans mb-4 text-white/85">Account</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/account" className="footer-link">My Account</Link></li>
                  <li><Link href="/account/orders" className="footer-link">Order History</Link></li>
                  <li><Link href="/account/quotes" className="footer-link">My Quotes</Link></li>
                  <li><Link href="/cart" className="footer-link">Cart</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="heading-sans mb-4 text-white/85">Support</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/pages/contact" className="footer-link">Contact Us</Link></li>
                  <li><Link href="/pages/shipping" className="footer-link">Shipping Info</Link></li>
                  <li><Link href="/pages/returns" className="footer-link">Returns</Link></li>
                  <li><Link href="/pages/warranty" className="footer-link">Warranty</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-white/10 pt-6">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-white/50 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} {storeName}. All rights reserved.</p>
            <p className="flex items-center gap-3">
              <span>ABN 33 669 144 629</span>
              <span aria-hidden>·</span>
              <Link href="/pages/privacy" className="transition-colors hover:text-white">Privacy</Link>
              <span aria-hidden>·</span>
              <Link href="/pages/terms" className="transition-colors hover:text-white">Terms</Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
