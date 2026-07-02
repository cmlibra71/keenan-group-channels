// ============================================================================
// Per-fork block component map. The KEYS are Block Registry types (shared in
// @keenan/services); the VALUES are THIS fork's components. Trim/extend this map
// per site — it is the authoritative list of what this fork can render, and is
// surfaced to the portal at /api/blocks/manifest for palette intersection.
// ============================================================================
import type { FC } from "react";
import type { RenderContext } from "@keenan/services";
import { RichContent } from "@/components/content/RichContent";
import { BannerBlock } from "@/components/home/BannerBlock";
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

// Faithful reproduction of IK's legacy /pages/[slug] article — keep in exact sync
// with app/pages/[slug]/page.tsx so migrated pages are pixel-identical.
const ContentPageBlock: FC<BlockProps> = ({ props }) => (
  <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
    <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">{str(props.heading)}</h1>
    {str(props.summary) && (
      <p className="text-base text-zinc-600 leading-relaxed mb-8">{str(props.summary)}</p>
    )}
    <RichContent html={str(props.body_html)} stripStyles className="ik-prose" />
    {str(props.updated) && (
      <p className="mt-12 text-xs text-zinc-400">Last updated: {str(props.updated)}</p>
    )}
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

const BannerAdapter: FC<BlockProps> = ({ props }) => (
  <BannerBlock
    heading={str(props.heading)}
    subheading={str(props.body)}
    image_url={str(props.image)}
    cta_text={str(props.cta_text)}
    cta_href={str(props.cta_href)}
  />
);

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

import { CATEGORY_BLOCK_COMPONENTS } from "./category-blocks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BLOCK_COMPONENTS: Record<string, FC<BlockProps> | ((p: BlockProps) => any)> = {
  rich_text: RichTextBlock,
  content_page: ContentPageBlock,
  raw_html: RawHtmlBlock,
  image: ImageBlock,
  spacer: SpacerBlock,
  cta: CtaBlock,
  hero: HeroBlock,
  banner: BannerAdapter,
  product_listing: ProductListingBlock,
  // Category-template blocks (render the RenderContext category record).
  ...CATEGORY_BLOCK_COMPONENTS,
};

export const SUPPORTED_BLOCK_TYPES = Object.keys(BLOCK_COMPONENTS);
