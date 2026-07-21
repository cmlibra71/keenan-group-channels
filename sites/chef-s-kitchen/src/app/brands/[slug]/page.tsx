import { notFound } from "next/navigation";
import { draftMode, cookies, headers } from "next/headers";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getProducts, getFeatureFlag, getCmsPage, getNamedStyles, getComponents, getChannelSetting, CHANNEL_ID } from "@/lib/store";
import { getListingPricing, getMemberContext, applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { composeBrandPagePayload, loadJsSandbox, computeCallResults, type NodeTree } from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { BuilderBrandPage } from "@/builder/BuilderBrandPage";
import type { GridProduct } from "@/components/product/ProductGridClient";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BrandHero, BrandProducts, DEFAULT_BRAND_BLOCKS } from "@/blocks/brand-page-blocks";
import { TemplateRenderer } from "@/blocks/TemplateRenderer";
import { effectiveSubBlocks } from "@/blocks/BlockRenderer";
import { BLOCK_REGISTRY } from "@keenan/services";
import { buildPartialResolver } from "@/blocks/partials";
import imageLoader from "@/lib/image-loader";
import { CardPartialGrid } from "@/blocks/widgets-server";

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
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  const brandCms = await getCmsPage("__brand__", draft).catch(() => null);

  // ═══ Site Builder node path — the 'brand' template authored in the node
  // designer, gated by node_brand_template_enabled (or draft mode with an
  // authored draft). The route stays data owner: scoped + account-priced rows
  // feed the sealed "brand-products" native; bindables come from the SHARED
  // composeBrandPagePayload (identical to the designer sample). ═══
  const nodeTree = ((brandCms as { node_tree?: unknown } | null)?.node_tree as NodeTree | null) ?? null;
  if (nodeTree && ((await getFeatureFlag("node_brand_template_enabled")) || draft)) {
    const scoped = (await applyAccountPrices(await applyCatalogScope(products))) as unknown as GridProduct[];
    const memberCtx = await getMemberContext().catch(() => null);
    const [pricesIncludeTax, cookieStore] = await Promise.all([
      getFeatureFlag("prices_include_tax"),
      cookies(),
    ]);
    const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);
    const payload = composeBrandPagePayload({
      channelId: CHANNEL_ID,
      brand: brand as unknown as Record<string, unknown>,
      products: scoped as unknown as Record<string, unknown>[],
      total,
      pricing: productCtx.pricing as { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null },
      customer: {
        isMember: memberCtx?.isMember ?? false,
        loggedIn: (memberCtx?.accountId ?? null) != null || (memberCtx?.isMember ?? false),
      },
      gst: { inclusive: gstInclusive, pricesIncludeTax },
      draft,
    });
    const namedStyles = await getNamedStyles().catch(() => ({}));
    const components = (await getComponents().catch(() => ({}))) as Record<string, NodeTree>;
    const builderCss =
      ((await getChannelSetting("builder_published_css").catch(() => null)) as { css?: string } | null)?.css ?? "";
    const jsFunctions = await cmsFunctionService.enabledMapForChannel(CHANNEL_ID).catch(() => ({}) as Record<string, string>);
    let callResults: Record<string, unknown> = {};
    if (Object.keys(jsFunctions).length > 0) {
      await loadJsSandbox(jsFunctions).catch(() => null);
      callResults = await computeCallResults(nodeTree.root, jsFunctions, payload as object).catch(() => ({}));
    }
    return (
      <>
        {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
        <BuilderBrandPage
          tree={nodeTree}
          payload={payload}
          products={scoped}
          pricing={productCtx.pricing}
          memberPricingAvailable={memberPricingEnabled}
          namedStyles={namedStyles}
          components={components}
          jsFunctions={jsFunctions}
          callResults={callResults}
          draft={draft}
        />
      </>
    );
  }
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
        if (b.block_type === "brand_hero") {
          // CMS v2: templated brand hero when the doc carries edited
          // sub-blocks (or CMS_V2_FORCE); the page supplies brand bindings.
          const v2 =
            process.env.CMS_V2_DISABLED !== "1" &&
            ((Array.isArray(b.props?.subBlocks) && (b.props!.subBlocks as unknown[]).length > 0) ||
              process.env.CMS_V2_FORCE === "1");
          if (v2) {
            return <BrandHeroV2 key={i} props={b.props ?? {}} brand={brand} total={total} draft={draft} />;
          }
          return <BrandHero key={i} brand={brand} total={total} />;
        }
        if (b.block_type === "brand_products") {
          const v2 =
            process.env.CMS_V2_DISABLED !== "1" &&
            ((Array.isArray(b.props?.subBlocks) && (b.props!.subBlocks as unknown[]).length > 0) ||
              draft ||
              process.env.CMS_V2_FORCE === "1");
          if (v2) {
            return (
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
          return <BrandProducts key={i} {...productCtx} />;
        }
        return <BlockRenderer key={i} blocks={[b]} draft={draft} />;
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
    settings: { channelName: "Chef's Depot", membershipFromPrice: null },
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
