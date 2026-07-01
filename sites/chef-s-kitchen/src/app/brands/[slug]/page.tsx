import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag, getCmsPage } from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BrandHero, BrandProducts, DEFAULT_BRAND_BLOCKS } from "@/blocks/brand-page-blocks";

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // getBrandBySlug → getBySlug runs transformRow, so the row is snake_case at runtime
  // (image_url). Type it so the loose Record<string,unknown> doesn't surface as `unknown`.
  const brand = (await getBrandBySlug(slug)) as
    | { id: number; name: string; slug: string; image_url: string | null }
    | null;

  if (!brand) {
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
  const { isEnabled: draft } = await draftMode();
  const brandCms = await getCmsPage("__brand__", draft).catch(() => null);
  const mainBlocks = ((brandCms?.blocks as unknown as RenderedBlock[]) ?? []).filter(
    (b) => b.region === "main"
  );
  const blocks: RenderedBlock[] =
    mainBlocks.length > 0 ? mainBlocks : (DEFAULT_BRAND_BLOCKS as unknown as RenderedBlock[]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-steel-400 mb-6">
        <Link href="/brands" className="hover:text-steel-500">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink-700">{brand.name as string}</span>
      </nav>

      {blocks.map((b, i) => {
        if (b.block_type === "brand_hero") return <BrandHero key={i} brand={brand} total={total} />;
        if (b.block_type === "brand_products") return <BrandProducts key={i} {...productCtx} />;
        return <BlockRenderer key={i} blocks={[b]} draft={draft} />;
      })}
    </div>
  );
}
