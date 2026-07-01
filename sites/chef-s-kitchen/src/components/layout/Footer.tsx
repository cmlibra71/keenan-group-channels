import Link from "next/link";
import Image from "next/image";

/**
 * Design-system footer: white logo on warm ink, brand blurb + link columns,
 * legal bottom bar. Collapses to stacked columns on mobile.
 *
 * Content is CMS-editable via the `footer` channel setting (FooterConfig). The
 * DEFAULT_FOOTER below is the current live content, so with no config set the
 * footer renders exactly as before — markup/classes are unchanged, only the
 * strings are now config-sourced.
 */
export type FooterLink = { label: string; href: string };
export type FooterColumn = { heading: string; links: FooterLink[] };
export type FooterConfig = {
  blurb?: string;
  shop?: FooterColumn;
  membership?: FooterColumn;
  account?: FooterColumn;
  support?: FooterColumn;
  abn?: string;
};

const DEFAULT_FOOTER: Required<Omit<FooterConfig, "membership">> & Pick<FooterConfig, "membership"> = {
  blurb:
    "Professional-grade kitchen equipment and supplies for the commercial trade. Wholesale pricing for members.",
  shop: {
    heading: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories" },
      { label: "Brands", href: "/brands" },
      { label: "Clearance", href: "/clearance" },
    ],
  },
  membership: {
    heading: "Membership",
    links: [
      { label: "Join", href: "/membership" },
      { label: "Member Benefits", href: "/membership#savings" },
      { label: "Prize Draws", href: "/membership" },
      { label: "Partner Offers", href: "/account/partner-offers" },
    ],
  },
  account: {
    heading: "Account",
    links: [
      { label: "My Account", href: "/account" },
      { label: "Order History", href: "/account/orders" },
      { label: "My Quotes", href: "/account/quotes" },
      { label: "Cart", href: "/cart" },
    ],
  },
  support: {
    heading: "Support",
    links: [
      { label: "Contact Us", href: "/pages/contact" },
      { label: "Shipping Info", href: "/pages/shipping" },
      { label: "Returns", href: "/pages/returns" },
      { label: "Warranty", href: "/pages/warranty" },
    ],
  },
  abn: "ABN 33 669 144 629",
};

function Column({ column }: { column: FooterColumn }) {
  return (
    <div>
      <h4 className="heading-sans mb-4 text-white/85">{column.heading}</h4>
      <ul className="space-y-2.5">
        {column.links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="footer-link">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({
  storeName,
  subscriptionsEnabled,
  config,
}: {
  storeName: string;
  subscriptionsEnabled?: boolean;
  config?: FooterConfig;
}) {
  const cfg = config ?? {};
  const blurb = cfg.blurb ?? DEFAULT_FOOTER.blurb;
  const shop = cfg.shop ?? DEFAULT_FOOTER.shop;
  const membership = cfg.membership ?? DEFAULT_FOOTER.membership;
  const account = cfg.account ?? DEFAULT_FOOTER.account;
  const support = cfg.support ?? DEFAULT_FOOTER.support;
  const abn = cfg.abn ?? DEFAULT_FOOTER.abn;

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
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">{blurb}</p>
          </div>

          {/* Link columns */}
          <div className="md:col-span-8">
            <div className={`grid grid-cols-2 gap-8 ${subscriptionsEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <Column column={shop} />
              {subscriptionsEnabled && membership && <Column column={membership} />}
              <Column column={account} />
              <Column column={support} />
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-white/10 pt-6">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-white/50 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} {storeName}. All rights reserved.</p>
            <p className="flex items-center gap-3">
              <span>{abn}</span>
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
