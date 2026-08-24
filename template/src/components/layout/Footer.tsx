import Link from "next/link";

export type FooterLink = { label: string; href: string };
export type FooterColumn = {
  heading: string;
  links: FooterLink[];
  /** A second headed group stacked under the column's own links. The portal's
   *  Navigation editor writes it when a footer link holds links of its own
   *  (card aveLhTwr); a storefront that ignored it would silently drop every
   *  link staff put under that heading. */
  extraHeading?: string;
  extraLinks?: FooterLink[];
};
export type FooterContact = { phone?: string; email?: string; address?: string };
export type FooterSocial = { platform: string; href: string };
export type FooterPaymentBadge = { name: string; image_url?: string | null };
export type FooterConfig = {
  tagline?: string;
  columns?: FooterColumn[];
  contact?: FooterContact;
  social?: FooterSocial[];
  payment_badges?: FooterPaymentBadge[];
  legal?: string;
};

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    heading: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories" },
      { label: "Brands", href: "/brands" },
      { label: "Clearance", href: "/clearance" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "My Account", href: "/account" },
      { label: "Order History", href: "/account/orders" },
      { label: "Cart", href: "/cart" },
    ],
  },
];

function FooterLinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {links.map((l) => (
        <li key={l.href + l.label}>
          <Link href={l.href} className="text-sm text-zinc-500 hover:text-zinc-900">
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Footer({
  storeName,
  config,
}: {
  storeName: string;
  config?: FooterConfig;
}) {
  const columns = config?.columns?.length ? config.columns : DEFAULT_COLUMNS;
  const colCount = Math.min(columns.length + 1, 6);
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div
          className={`grid grid-cols-1 gap-8 md:grid-cols-${colCount}`}
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}
        >
          <div>
            <h3 className="font-bold text-zinc-900">{storeName}</h3>
            {config?.tagline && (
              <p className="mt-2 text-sm text-zinc-500">{config.tagline}</p>
            )}
            {config?.contact && (
              <div className="mt-4 space-y-1 text-sm text-zinc-500">
                {config.contact.phone && (
                  <div>
                    <a href={`tel:${config.contact.phone}`} className="hover:text-zinc-900">
                      {config.contact.phone}
                    </a>
                  </div>
                )}
                {config.contact.email && (
                  <div>
                    <a href={`mailto:${config.contact.email}`} className="hover:text-zinc-900">
                      {config.contact.email}
                    </a>
                  </div>
                )}
                {config.contact.address && (
                  <div className="text-xs">{config.contact.address}</div>
                )}
              </div>
            )}
          </div>
          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="text-sm font-semibold text-zinc-900">{col.heading}</h4>
              <FooterLinkList links={col.links ?? []} />
              {col.extraHeading && col.extraLinks && col.extraLinks.length > 0 && (
                <>
                  <h4 className="mt-6 text-sm font-semibold text-zinc-900">{col.extraHeading}</h4>
                  <FooterLinkList links={col.extraLinks} />
                </>
              )}
            </div>
          ))}
        </div>
        {(config?.payment_badges?.length || config?.social?.length) && (
          <div className="mt-8 border-t border-zinc-200 pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {config?.payment_badges && config.payment_badges.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {config.payment_badges.map((b) =>
                  b.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={b.name}
                      src={b.image_url}
                      alt={b.name}
                      className="h-6 w-auto object-contain"
                    />
                  ) : (
                    <span key={b.name} className="text-xs text-zinc-400">
                      {b.name}
                    </span>
                  )
                )}
              </div>
            )}
            {config?.social && config.social.length > 0 && (
              <div className="flex items-center gap-3">
                {config.social.map((s) => (
                  <a
                    key={s.platform}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900"
                  >
                    {s.platform}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-8 border-t border-zinc-200 pt-8 text-center text-sm text-zinc-400">
          {config?.legal ?? `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
        </div>
      </div>
    </footer>
  );
}
