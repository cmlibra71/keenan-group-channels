import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { draftMode, headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag, getCmsPage } from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import { renderBrandNodeBranch } from "@/builder/brand-node-branch";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BrandIntro } from "@/components/brand/BrandIntro";
import { BrandProductLines } from "@/components/brand/BrandProductLines";
import { BrandIndustryUses } from "@/components/brand/BrandIndustryUses";
import { BrandFaq } from "@/components/brand/BrandFaq";

type BrandMetafields = {
  intro_html?: string;
  product_lines?: { name: string; slug?: string; href?: string; image_url?: string }[];
  industry_uses?: { name: string; image_url?: string; href?: string }[];
  faq?: { q: string; a: string }[];
  featured_product_sku?: string;
};

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
        page_title: string | null;
        meta_description: string | null;
        metafields: Record<string, unknown> | null;
        /** This storefront's OWN approved page text (brand_channel_seo), as HTML. */
        channel_intro_html?: string | null;
      }
    | null;

  if (!brand) {
    notFound();
  }

  const [{ products, total }, memberPricingEnabled] = await Promise.all([
    getProducts({ brandId: brand.id as number, limit: 48 }),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const meta = ((brand.metafields as BrandMetafields | null) ?? {}) as BrandMetafields;
  const pageTitle = (brand.page_title as string | null) || (brand.name as string);

  // Editable CMS zones on every brand page (global brand template) — empty unless set.
  // `x-kg-json` is the parity surface: /json/brands/<slug> forces the node path
  // and the draft tree, so a conversion can be diffed against this live page.
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  const brandCms = await getCmsPage("__brand__", draft).catch(() => null);

  // Site Builder node path — additive. Returns null (and we fall through to the
  // blocks below) until a brand tree is authored and the flag is on.
  const nodeRendered = await renderBrandNodeBranch({
    brandCms,
    brand: brand as unknown as Record<string, unknown>,
    products,
    total,
    pricing: { memberPriceMap: await getListingMemberPrices(products) },
    memberPricingEnabled,
    draft,
  });
  if (nodeRendered) return nodeRendered;

  const brandRegion = (r: string): RenderedBlock[] =>
    ((brandCms?.blocks as unknown as RenderedBlock[]) ?? []).filter((b) => b.region === r);
  const aboveBrand = brandRegion("above_listing");
  const belowBrand = brandRegion("below_listing");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {aboveBrand.length > 0 && <BlockRenderer blocks={aboveBrand} draft={draft} />}
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/brands" className="hover:text-zinc-600">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-zinc-700">{brand.name as string}</span>
      </nav>

      {/* Hero section */}
      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-zinc-50 rounded-2xl overflow-hidden">
        {brand.image_url && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 relative min-h-[200px]">
            <Image
              src={brand.image_url as string}
              alt={brand.name as string}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-6"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${brand.image_url ? "" : "pl-8"}`}>
          <h1 className="text-3xl font-bold text-zinc-900">{pageTitle}</h1>
          {brand.meta_description != null && (
            <p className="mt-3 text-base text-zinc-600 leading-relaxed">
              {brand.meta_description as string}
            </p>
          )}
          <p className="mt-3 text-sm text-zinc-500">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {/* The content block at the top of the brand page (card xvz6pXB4, Steve 2026-08-13).
          This site's OWN approved text wins; `metafields.intro_html` is the brand copy
          scraped from the old Industry Kitchens site, kept as the fallback so the 19 pages
          carrying it read exactly as they do today until wording is published for them. */}
      <BrandIntro html={brand.channel_intro_html || meta.intro_html} />

      {/* Brand product lines (e.g. Rational iCombi Pro / Classic / Vario) */}
      <BrandProductLines heading="Product Lines" lines={meta.product_lines} />

      {/* Products */}
      {products.length > 0 ? (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Products</h2>
          <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={await getListingMemberPrices(products)} listId={`brand_${brand.slug ?? brand.id}`} listName={String(brand.name ?? "")} />
        </div>
      ) : (
        <p className="text-zinc-500 text-center py-12">No products from this brand yet.</p>
      )}

      {/* Industry-use tiles (e.g. Cafés / Restaurants / Hotels) */}
      <BrandIndustryUses heading="Top Use Cases" items={meta.industry_uses} />

      {/* Brand FAQ accordion */}
      <BrandFaq items={meta.faq} />

      {belowBrand.length > 0 && <BlockRenderer blocks={belowBrand} draft={draft} />}
    </div>
  );
}
