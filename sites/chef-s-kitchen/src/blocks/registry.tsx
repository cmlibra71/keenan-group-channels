// ============================================================================
// Per-fork block component map. The KEYS are Block Registry types (shared in
// @keenan/services); the VALUES are THIS fork's components. Trim/extend this map
// per site — it is the authoritative list of what this fork can render, and is
// surfaced to the portal at /api/blocks/manifest for palette intersection.
// ============================================================================
import type { FC } from "react";
import type { RenderContext } from "@keenan/services";
import { RichContent } from "@/components/content/RichContent";
import { ProductGrid } from "@/components/product/ProductGrid";
import { getProducts, getCategoryBySlug, getCategoryListing } from "@/lib/store";

/** ctx is present when rendering a template document (product/category record). */
type BlockProps = { props: Record<string, unknown>; ctx?: RenderContext };
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// --- content blocks ---------------------------------------------------------

const RichTextBlock: FC<BlockProps> = ({ props }) => (
  <section className="mx-auto max-w-3xl px-4 py-8">
    <RichContent html={str(props.html)} stripStyles className="prose prose-zinc max-w-none" />
  </section>
);

// Faithful reproduction of CD's legacy /pages/[slug] article — keep markup in
// exact sync with app/pages/[slug]/page.tsx so migrated pages are pixel-identical.
const ContentPageBlock: FC<BlockProps> = ({ props }) => (
  <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
    <h1 className="heading-serif text-3xl sm:text-4xl text-text-primary mb-4">
      {str(props.heading)}
    </h1>
    {str(props.summary) && (
      <p className="text-base text-text-secondary leading-relaxed mb-8">{str(props.summary)}</p>
    )}
    <RichContent html={str(props.body_html)} stripStyles className="content-prose" />
    {str(props.updated) && <p className="mt-12 caption">Last updated: {str(props.updated)}</p>}
  </article>
);

const RawHtmlBlock: FC<BlockProps> = ({ props }) => (
  <section className="mx-auto max-w-5xl px-4 py-8">
    <RichContent html={str(props.html)} />
  </section>
);

const ImageBlock: FC<BlockProps> = ({ props }) => {
  const src = str(props.image);
  if (!src) return null;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={str(props.alt)} className="mx-auto max-w-full rounded-lg" />
  );
  const href = str(props.href);
  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      {href ? <a href={href}>{img}</a> : img}
    </section>
  );
};

const SpacerBlock: FC<BlockProps> = ({ props }) => {
  const h = props.height === "lg" ? "h-24" : props.height === "sm" ? "h-6" : "h-12";
  return <div className={h} aria-hidden />;
};

const CtaBlock: FC<BlockProps> = ({ props }) => (
  <section className="mx-auto max-w-3xl px-4 py-10 text-center">
    {str(props.heading) && (
      <h2 className="mb-3 text-2xl font-bold text-zinc-900">{str(props.heading)}</h2>
    )}
    {str(props.body) && <p className="mb-6 text-zinc-600">{str(props.body)}</p>}
    {str(props.cta_text) && (
      <a
        href={str(props.cta_href) || "#"}
        className="inline-block rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
      >
        {str(props.cta_text)}
      </a>
    )}
  </section>
);

const HeroBlock: FC<BlockProps> = ({ props }) => (
  <section className="relative overflow-hidden bg-zinc-900 text-white">
    {str(props.image) && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={str(props.image)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
    )}
    <div className="relative mx-auto max-w-5xl px-4 py-20 text-center">
      <h1 className="text-4xl font-bold sm:text-5xl">{str(props.headline)}</h1>
      {str(props.subheadline) && (
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-200">{str(props.subheadline)}</p>
      )}
      {str(props.cta_text) && (
        <a
          href={str(props.cta_href) || "#"}
          className="mt-8 inline-block rounded-md bg-white px-6 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          {str(props.cta_text)}
        </a>
      )}
    </div>
  </section>
);

// --- landing-page blocks (card wp4GM2tq) ------------------------------------
// Ready-made sections a page can drop in and re-word (Steve, 2026-07-28: "drop
// in ready made blocks, but be able to customise elements such as text inside
// those blocks"). Each was ALREADY offered by the portal's Add-a-block list and
// had no component here, so the page came back "Block banner is not available
// on this site" in preview and blank to a shopper.

/** Full-width picture with a headline, a line of copy and one button over it. */
const BannerBlock: FC<BlockProps> = ({ props }) => {
  const image = str(props.image);
  const heading = str(props.heading);
  const body = str(props.body);
  const ctaText = str(props.cta_text);
  if (!image && !heading && !body && !ctaText) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-lg bg-zinc-900">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div className="relative px-6 py-14 text-center sm:px-10 sm:py-20">
          {heading && (
            <h2 className="heading-serif text-3xl text-white sm:text-4xl">{heading}</h2>
          )}
          {body && (
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-zinc-200">
              {body}
            </p>
          )}
          {ctaText && (
            <a
              href={str(props.cta_href) || "#"}
              className="mt-7 inline-block rounded-md bg-white px-6 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              {ctaText}
            </a>
          )}
        </div>
      </div>
    </section>
  );
};

type FaqItem = { q?: unknown; a?: unknown };

/** Author-written questions and answers. Distinct from `seo_faq`, which draws
 *  the homepage's own copy from a store setting rather than from the page. */
const FaqBlock: FC<BlockProps> = ({ props }) => {
  const items = (Array.isArray(props.items) ? props.items : []) as FaqItem[];
  const rows = items.filter((it) => str(it.q) || str(it.a));
  if (rows.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      {str(props.heading) && (
        <h2 className="heading-serif mb-6 text-2xl text-text-primary">{str(props.heading)}</h2>
      )}
      <div className="divide-y divide-zinc-200 border-y border-zinc-200">
        {rows.map((it, i) => (
          <details key={i} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-text-primary">
              {str(it.q)}
              <span className="text-zinc-400 transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <RichContent
              html={str(it.a)}
              stripStyles
              className="mt-2.5 text-sm leading-relaxed text-text-secondary"
            />
          </details>
        ))}
      </div>
    </section>
  );
};

type StatItem = { value?: unknown; label?: unknown };

/** A row of headline numbers ("30 years", "12,000 products"). */
const StatsBannerBlock: FC<BlockProps> = ({ props }) => {
  const stats = (Array.isArray(props.stats) ? props.stats : []) as StatItem[];
  const rows = stats.filter((s) => str(s.value) || str(s.label));
  if (rows.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {rows.map((s, i) => (
          <div key={i} className="text-center">
            <p className="heading-serif text-3xl text-text-primary">{str(s.value)}</p>
            <p className="mt-1 text-sm text-text-secondary">{str(s.label)}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

// --- system (live data) blocks ----------------------------------------------

async function ProductListingBlock({ props }: BlockProps) {
  const source = str(props.source) || "featured";
  const limit = typeof props.limit === "number" ? props.limit : 8;
  let products: unknown[] = [];
  try {
    if (source === "featured") ({ products } = await getProducts({ featured: true, limit }));
    else if (source === "onSale") ({ products } = await getProducts({ onSale: true, limit }));
    else if (source === "category" && str(props.category_slug)) {
      const cat = await getCategoryBySlug(str(props.category_slug));
      if (cat) ({ products } = await getCategoryListing(cat.id, { limit }));
    }
    // NOTE: source === "manual" (hand-picked product_ids) needs a by-ids store
    // accessor that doesn't exist yet — falls through to empty for now.
  } catch {
    products = [];
  }
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      {str(props.heading) && (
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">{str(props.heading)}</h2>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ProductGrid products={products as any} />
    </section>
  );
}

// --- the map ----------------------------------------------------------------

import { HOME_BLOCK_COMPONENTS } from "./home-blocks";
import { EmbedBlock } from "./EmbedBlock";
import { CATEGORY_BLOCK_COMPONENTS } from "./category-blocks";
import { PRODUCT_BLOCK_COMPONENTS } from "./product-blocks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BLOCK_COMPONENTS: Record<string, FC<BlockProps> | ((p: BlockProps) => any)> = {
  rich_text: RichTextBlock,
  content_page: ContentPageBlock,
  raw_html: RawHtmlBlock,
  image: ImageBlock,
  embed: EmbedBlock,
  spacer: SpacerBlock,
  cta: CtaBlock,
  hero: HeroBlock,
  banner: BannerBlock,
  faq: FaqBlock,
  stats_banner: StatsBannerBlock,
  product_listing: ProductListingBlock,
  // Homepage section blocks (own data; verbatim markup from the legacy homepage).
  ...HOME_BLOCK_COMPONENTS,
  // Brand page sections — rendered directly by the brand page with the live brand
  // context; listed here so the editor palette/manifest offers them.
  brand_hero: () => null,
  brand_products: () => null,
  // Category-template blocks (render the RenderContext category record).
  ...CATEGORY_BLOCK_COMPONENTS,
  // Product-template blocks (real RenderContext components — these override the
  // route-rendered stubs so the render surface and product template work).
  ...PRODUCT_BLOCK_COMPONENTS,
};

export const SUPPORTED_BLOCK_TYPES = Object.keys(BLOCK_COMPONENTS);
