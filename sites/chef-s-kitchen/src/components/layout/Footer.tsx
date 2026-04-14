import Link from "next/link";

export function Footer({ storeName, subscriptionsEnabled }: { storeName: string; subscriptionsEnabled?: boolean }) {
  return (
    <footer className="border-t border-border bg-white mt-20">
      <div className="container-page py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand column */}
          <div className="md:col-span-4">
            <h3 className="heading-serif text-xl text-text-primary">{storeName}</h3>
            <p className="mt-3 body-text max-w-xs">
              Professional-grade kitchen equipment and supplies for the commercial trade.
            </p>
          </div>

          {/* Link columns */}
          <div className="md:col-span-8">
            <div className={`grid grid-cols-2 gap-8 ${subscriptionsEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <div>
                <h4 className="heading-sans text-text-body tracking-widest mb-4">Shop</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/products" className="footer-link">All Products</Link></li>
                  <li><Link href="/categories" className="footer-link">Categories</Link></li>
                  <li><Link href="/brands" className="footer-link">Brands</Link></li>
                  <li><Link href="/clearance" className="footer-link">Clearance</Link></li>
                </ul>
              </div>
              {subscriptionsEnabled && (
                <div>
                  <h4 className="heading-sans text-text-body tracking-widest mb-4">Membership</h4>
                  <ul className="space-y-2.5">
                    <li><Link href="/membership" className="footer-link">Join</Link></li>
                    <li><Link href="/membership#savings" className="footer-link">Member Benefits</Link></li>
                    <li><Link href="/membership#draws" className="footer-link">Prize Draws</Link></li>
                    <li><Link href="/account/partner-offers" className="footer-link">Partner Offers</Link></li>
                  </ul>
                </div>
              )}
              <div>
                <h4 className="heading-sans text-text-body tracking-widest mb-4">Account</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/account" className="footer-link">My Account</Link></li>
                  <li><Link href="/account/orders" className="footer-link">Order History</Link></li>
                  <li><Link href="/cart" className="footer-link">Cart</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="heading-sans text-text-body tracking-widest mb-4">Support</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/contact" className="footer-link">Contact Us</Link></li>
                  <li><Link href="/shipping" className="footer-link">Shipping Info</Link></li>
                  <li><Link href="/returns" className="footer-link">Returns</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="divider mt-12" />
        <div className="pt-8 text-center">
          <p className="caption">
            &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
