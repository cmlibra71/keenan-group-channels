import Link from "next/link";
import Image from "next/image";
import {
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Linkedin,
  type LucideIcon,
} from "lucide-react";

export type FooterLink = { label: string; href: string };
export type FooterColumn = {
  heading: string;
  links: FooterLink[];
  extraHeading?: string;
  extraLinks?: FooterLink[];
};
export type FooterContact = { phone?: string; email?: string; address?: string };
export type FooterSocial = { platform: string; href: string };
export type FooterBadge = { name: string; image_url?: string | null; href?: string };
export type FooterConfig = {
  tagline?: string;
  columns?: FooterColumn[];
  contact?: FooterContact;
  social?: FooterSocial[];
  payment_badges?: FooterBadge[];
  partners?: FooterBadge[];
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
];

// TikTok / Pinterest aren't in lucide; inline their glyphs.
const TikTokIcon = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden>
    <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);
const PinterestIcon = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden>
    <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
  </svg>
);

const SOCIAL_ICONS: Record<string, LucideIcon | ((p: { className?: string }) => React.ReactElement)> = {
  facebook: Facebook,
  instagram: Instagram,
  twitter: Twitter,
  x: Twitter,
  youtube: Youtube,
  linkedin: Linkedin,
  tiktok: TikTokIcon,
  pinterest: PinterestIcon,
};

function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function LinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {links.map((l) => (
        <li key={l.href + l.label}>
          <SmartLink href={l.href} className="text-sm text-zinc-500 hover:text-[#D94B2B]">
            {l.label}
          </SmartLink>
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
  const partners = config?.partners ?? [];
  const paymentBadges = config?.payment_badges ?? [];
  const social = config?.social ?? [];

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="text-sm font-bold uppercase tracking-wide text-zinc-900">
                {col.heading}
              </h4>
              <LinkList links={col.links} />
              {col.extraHeading && col.extraLinks && col.extraLinks.length > 0 && (
                <>
                  <h4 className="mt-6 text-sm font-bold uppercase tracking-wide text-zinc-900">
                    {col.extraHeading}
                  </h4>
                  <LinkList links={col.extraLinks} />
                </>
              )}
            </div>
          ))}
        </div>

        {/* Socials + partner / payment badges */}
        {(social.length > 0 || partners.length > 0 || paymentBadges.length > 0) && (
          <div className="mt-10 flex flex-col gap-6 border-t border-zinc-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
            {social.length > 0 && (
              <div className="flex items-center gap-2">
                {social.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform.toLowerCase()];
                  return (
                    <a
                      key={s.platform}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.platform}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-[#D94B2B] hover:text-white hover:ring-[#D94B2B]"
                    >
                      {Icon ? (
                        <Icon className="h-4 w-4" />
                      ) : (
                        <span className="text-xs">{s.platform.charAt(0)}</span>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {partners.map((p) =>
                p.image_url ? (
                  <SmartLink key={p.name} href={p.href || "#"} className="block">
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      width={120}
                      height={48}
                      className="h-9 w-auto object-contain"
                    />
                  </SmartLink>
                ) : null
              )}
              {paymentBadges.map((b) => (
                <span
                  key={b.name}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Legal */}
        <div className="mt-8 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-400">
          {config?.legal ?? `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
        </div>
      </div>
    </footer>
  );
}
