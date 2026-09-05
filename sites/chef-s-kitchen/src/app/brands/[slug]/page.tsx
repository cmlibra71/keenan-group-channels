import { Fragment } from "react";
import { notFound } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import type { Metadata } from "next";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag, getCmsPage } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { renderBrandNodeBranch, type BrandListingPricing } from "@/builder/brand-node-branch";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BrandHero, BrandProducts, DEFAULT_BRAND_BLOCKS } from "@/blocks/brand-page-blocks";
import { BrandIntro } from "@/components/brand/BrandIntro";
import { BrandSearch } from "@/components/brand/BrandSearch";
import { TemplateRenderer } from "@/blocks/TemplateRenderer";
import { effectiveSubBlocks } from "@/blocks/BlockRenderer";
import { BLOCK_REGISTRY } from "@keenan/services";
import { buildPartialResolver } from "@/blocks/partials";
import imageLoader from "@/lib/image-loader";
import { CardPartialGrid } from "@/blocks/widgets-server";

/**
 * Brand pages had no title or description of their own, so every one of them inherited
 * the site default — the worst possible state for a page whose whole job is to rank for
 * a brand name. The wording comes from THIS storefront's own approved brand-page copy
 * (overlaid onto the shared brand row by the channel store), falling back to the shared
 * brand fields and finally to the brand name. Brands are shared records but brand PAGES
 * are per site: one text on both sites is what makes them compete. (Card xvz6pXB4.)
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = (await getBrandBySlug(slug).catch(() => null)) as
    | {
        name: string;
        seo_page_title?: string | null;
        page_title: string | null;
        meta_description: string | null;
      }
    | null;
  if (!brand) return {};
  return {
    title: brand.seo_page_title || brand.page_title || brand.name,
    description: brand.meta_description || undefined,
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // getBrandBySlug → getBySlug runs transformRow, so the row is snake_case at runtime
  // (image_url). Type it so the loose Record<string,unknown> doesn't surface as `unknown`.
  const brand = (await getBrandBySlug(slug)) as
    | {
        id: number;
        name: string;
        slug: string;
        image_url: string | null;
        /** This storefront's OWN approved page text (brand_channel_seo), as HTML. */
        channel_intro_html?: string | null;
      }
    | null;

  if (!brand) {
    // A renamed brand address redirects rather than bare-404ing. (card EVvRDnZt)
    await redirectIfMapped(`/brands/${slug}`);
    notFound();
  }

  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts({ brandId: brand.id as number, limit: 48 }),
    getFeatureFlag("member_pricing_enabled"),
  ]);
  const productCtx = {
    products,
    memberPricingAvailable: memberPricingEnabled,
    pricing: await getListingPricing(products),
  };

  // Brand page content is an ordered block list (the __brand__ template's `main`
  // region), editable in Pages & Content. Defaults to hero + products when unset,
  // so an unedited template renders exactly as before.
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  const brandCms = await getCmsPage("__brand__", draft).catch(() => null);

  // ═══ Site Builder node path — the 'brand' template authored in the node
  // designer. The body of this branch used to live here, and only here, which
  // is exactly why Industry Kitchens could not have one; it is now engine
  // (src/builder/brand-node-branch.tsx) shared by both sites. The route stays
  // data owner and hands its own pricing shape in. ═══
  const nodeRendered = await renderBrandNodeBranch({
    brandCms,
    brand: brand as unknown as Record<string, unknown>,
    products,
    total,
    pricing: productCtx.pricing as BrandListingPricing,
    memberPricingEnabled,
    draft,
  });
  if (nodeRendered) return nodeRendered;
  const mainBlocks = ((brandCms?.blocks as unknown as RenderedBlock[]) ?? []).filter(
    (b) => b.region === "main"
  );
  const blocks: RenderedBlock[] =
    mainBlocks.length > 0 ? mainBlocks : (DEFAULT_BRAND_BLOCKS as unknown as RenderedBlock[]);

  // The content block at the top of the page (card xvz6pXB4, Steve 2026-08-13): under the
  // hero, above the products, which is where a shopper reads it before deciding what to
  // click. It sits after the hero BLOCK rather than at a fixed position so a reordered
  // brand template keeps it with the heading; with no hero block it leads the page.
  const heroIndex = blocks.findIndex((b) => b.block_type === "brand_hero");
  const intro = <BrandIntro html={brand.channel_intro_html} />;
  // Search within this brand — a plain form onto the site search, narrowed to
  // this brand (card 1RLP5nSJ). It rides with the intro so a reordered brand
  // template keeps both with the heading, and it is only offered where there is
  // something to search: a brand with no products returns nothing whatever is
  // typed.
  const heroExtras = (
    <>
      {intro}
      {total > 0 && <BrandSearch brandName={brand.name as string} />}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-steel-400 mb-6">
        <Link href="/brands" className="hover:text-steel-500">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink-700">{brand.name as string}</span>
      </nav>

      {heroIndex < 0 && heroExtras}

      {blocks.map((b, i) => {
        const withIntro = (node: React.ReactNode) =>
          i === heroIndex ? (
            <Fragment key={i}>
              {node}
              {heroExtras}
            </Fragment>
          ) : (
            node
          );
        if (b.block_type === "brand_hero") {
          // CMS v2: templated brand hero when the doc carries edited
          // sub-blocks (or CMS_V2_FORCE); the page supplies brand bindings.
          const v2 =
            process.env.CMS_V2_DISABLED !== "1" &&
            ((Array.isArray(b.props?.subBlocks) && (b.props!.subBlocks as unknown[]).length > 0) ||
              process.env.CMS_V2_FORCE === "1");
          if (v2) {
            return withIntro(
              <BrandHeroV2 key={i} props={b.props ?? {}} brand={brand} total={total} draft={draft} />
            );
          }
          return withIntro(<BrandHero key={i} brand={brand} total={total} />);
        }
        if (b.block_type === "brand_products") {
          const v2 =
            process.env.CMS_V2_DISABLED !== "1" &&
            ((Array.isArray(b.props?.subBlocks) && (b.props!.subBlocks as unknown[]).length > 0) ||
              draft ||
              process.env.CMS_V2_FORCE === "1");
          if (v2) {
            return withIntro(
              <BrandProductsV2
                key={i}
                props={b.props ?? {}}
                products={products as never}
                pricing={productCtx.pricing}
                memberPricingEnabled={memberPricingEnabled}
                draft={draft}
              />
            );
          }
          return withIntro(<BrandProducts key={i} {...productCtx} />);
        }
        return withIntro(<BlockRenderer key={i} blocks={[b]} draft={draft} />);
      })}
    </div>
  );
}


/** CMS v2 brand hero — sub-block templates with page-supplied brand bindings. */
async function BrandHeroV2({
  props,
  brand,
  total,
  draft,
}: {
  props: Record<string, unknown>;
  brand: { id: number; name: string; slug: string; image_url: string | null };
  total: number;
  draft: boolean;
}) {
  const def = BLOCK_REGISTRY.brand_hero;
  const subBlocks = effectiveSubBlocks(props, def?.subBlockSchema, "chef-s-kitchen");
  const resolvePartial = await buildPartialResolver(undefined);
  const widths = [400, 600, 1024] as const;
  const data = {
    brand: {
      name: brand.name,
      slug: brand.slug,
      image: brand.image_url ? imageLoader({ src: brand.image_url, width: 600, quality: 80 }) : null,
      imageSrcset: brand.image_url
        ? widths
            .map((w) => `${imageLoader({ src: brand.image_url as string, width: w, quality: 80 })} ${w}w`)
            .join(", ")
        : null,
      productCountLabel: `${total} ${total === 1 ? "product" : "products"}`,
    },
    settings: { channelName: "Chefs Depot", membershipFromPrice: null },
  };
  return (
    <>
      {subBlocks.map((sb) =>
        sb.hidden ? null : (
          <TemplateRenderer
            key={sb.id}
            template={sb.template ?? ""}
            data={data}
            seedKey="brand/hero"
            channelKey="chef-s-kitchen"
            resolvePartial={resolvePartial}
            draft={draft}
          />
        )
      )}
    </>
  );
}


/** CMS v2.1 brand products — editable heading + the shared card partial grid. */
async function BrandProductsV2({
  props,
  products,
  pricing,
  memberPricingEnabled,
  draft,
}: {
  props: Record<string, unknown>;
  products: Record<string, unknown>[];
  pricing: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  memberPricingEnabled: boolean;
  draft: boolean;
}) {
  const def = BLOCK_REGISTRY.brand_products;
  const subBlocks = effectiveSubBlocks(props, def?.subBlockSchema, "chef-s-kitchen");
  const resolvePartial = await buildPartialResolver(undefined);
  if (products.length === 0) {
    return <p className="text-steel-500 text-center py-12">No products from this brand yet.</p>;
  }
  return (
    <div>
      {subBlocks.map((sb) =>
        sb.hidden ? null : (
          <TemplateRenderer
            key={sb.id}
            template={sb.template ?? ""}
            data={{ props }}
            seedKey="brand/products_heading"
            channelKey="chef-s-kitchen"
            resolvePartial={resolvePartial}
            draft={draft}
          />
        )
      )}
      <CardPartialGrid
        products={products}
        pricing={pricing}
        memberPricingEnabled={memberPricingEnabled}
      />
    </div>
  );
}
