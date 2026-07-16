import { notFound, redirect } from "next/navigation";
import { draftMode } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import {
  getCategoryBySlug,
  getCategoryListing,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getChannelSetting,
  getCmsCategoryPage,
  getCmsTemplate,
} from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getListingPricing, getMemberContext, applyAccountPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { assertCategoryVisible, applyCatalogScope } from "@/lib/catalog-scope";
import { getNamedStyles, getComponents, CHANNEL_ID } from "@/lib/store";
import { composeCategoryPagePayload, loadJsSandbox, computeCallResults, type NodeTree } from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { BuilderCategoryPage } from "@/builder/BuilderCategoryPage";
import type { GridProduct } from "@/components/product/ProductGridClient";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

// Emit category SEO — from the CMS category page's meta if set, else the
// category record's own fields. (Previously the category page emitted none.)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const cms = await getCmsCategoryPage(category.id).catch(() => null);
  const meta = (cms?.page_meta ?? {}) as { meta_title?: string; meta_description?: string };
  const cat = category as { name: string; page_title?: string | null; meta_description?: string | null };
  return {
    title: meta.meta_title || cat.page_title || cat.name,
    description: meta.meta_description || cat.meta_description || undefined,
  };
}

const PER_PAGE = 24;
const MAX_PAGES = 8; // "Load more" renders cumulatively; hard cap keeps queries sane.

type SearchParams = {
  sub?: string;
  brand?: string;
  price?: string;
  stock?: string;
  sort?: string;
  page?: string;
};

const parseIds = (v?: string) =>
  v?.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)) ?? [];

/**
 * Design-system category (collection) page: branded banner, sticky faceted
 * filter rail, sort/result toolbar, 3-up grid beside the rail, and
 * SEO-friendly "Load more" pagination (cumulative ?page=N).
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);

  if (!category) {
    // Check for redirect from old category structure
    const redirects = await getChannelSetting("category_redirects");
    if (redirects && typeof redirects === "object" && !Array.isArray(redirects)) {
      const newSlug = (redirects as Record<string, string>)[slug];
      if (newSlug) {
        redirect(`/categories/${newSlug}`);
      }
    }
    notFound();
  }

  // L2 — group∩contact CATEGORY access. Previously enforced on /products only, so a restricted
  // category's page was still reachable by URL; it now 404s like any other unreachable resource.
  // (Its products are independently filtered in ProductGrid, so nothing leaks through the grid.)
  await assertCategoryVisible(category.id);

  const page = Math.min(MAX_PAGES, Math.max(1, parseInt(sp.page || "1", 10)));
  const sort = (["price_asc", "price_desc", "saving", "newest"] as const).includes(
    sp.sort as never
  )
    ? (sp.sort as "price_asc" | "price_desc" | "saving" | "newest")
    : "relevance";

  const priceBands = (sp.price?.split(",").filter(Boolean) ?? []).filter((b) =>
    ["lt1000", "1000to3000", "gt3000"].includes(b)
  ) as ("lt1000" | "1000to3000" | "gt3000")[];
  const availability = (sp.stock?.split(",").filter(Boolean) ?? []).filter((a) =>
    ["in_stock", "clearance"].includes(a)
  ) as ("in_stock" | "clearance")[];

  const [listing, breadcrumbs, memberPricingEnabled] = await Promise.all([
    getCategoryListing(category.id, {
      page: 1,
      limit: PER_PAGE * page, // cumulative for Load more
      subcategoryIds: parseIds(sp.sub),
      brandIds: parseIds(sp.brand),
      priceBands,
      availability,
      sort,
    }),
    getCategoryBreadcrumbs(category.path_ids || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const { products, total, facets } = listing;
  const pricing = await getListingPricing(products);
  const shown = products.length;
  const hasMore = shown < total && page < MAX_PAGES;

  // Editable CMS content zones around the (system) listing. Empty when no CMS
  // category page is set — so the page renders exactly as before.
  const { isEnabled: draft } = await draftMode();
  const cmsCat = await getCmsCategoryPage(category.id, draft).catch(() => null);
  const region = (r: string): RenderedBlock[] =>
    ((cmsCat?.blocks as unknown as RenderedBlock[]) ?? []).filter((b) => b.region === r);
  const aboveBlocks = region("above_listing");
  const belowBlocks = region("below_listing");

  const nextPageHref = (() => {
    const next = new URLSearchParams();
    if (sp.sub) next.set("sub", sp.sub);
    if (sp.brand) next.set("brand", sp.brand);
    if (sp.price) next.set("price", sp.price);
    if (sp.stock) next.set("stock", sp.stock);
    if (sp.sort) next.set("sort", sp.sort);
    next.set("page", String(page + 1));
    return `/categories/${slug}?${next.toString()}`;
  })();

  // ═══ Site Builder node path — the 'category_layout' template authored in
  // the node designer, gated by node_category_template_enabled (or draft mode
  // with an authored draft). The route stays data owner: the sealed
  // "category-listing" native gets the SAME scoped/priced listing the native
  // page renders; bindables come from the SHARED composeCategoryPagePayload. ═══
  {
    const catTemplate = (await getCmsTemplate("category_layout", draft).catch(() => null)) as {
      node_tree?: unknown;
    } | null;
    const nodeTree = (catTemplate?.node_tree as NodeTree | null) ?? null;
    if (nodeTree && ((await getFeatureFlag("node_category_template_enabled")) || draft)) {
      const scoped = (await applyAccountPrices(await applyCatalogScope(products))) as unknown as GridProduct[];
      const memberCtx = await getMemberContext().catch(() => null);
      const payload = composeCategoryPagePayload({
        channelId: CHANNEL_ID,
        category: category as unknown as Record<string, unknown>,
        listing: {
          products: scoped as unknown as Record<string, unknown>[],
          total,
          facets,
        },
        page,
        hasMore,
        breadcrumbs: breadcrumbs as { id: number; name: string; slug: string }[],
        customer: {
          isMember: memberCtx?.isMember ?? false,
          loggedIn: (memberCtx?.accountId ?? null) != null || (memberCtx?.isMember ?? false),
        },
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
          <BuilderCategoryPage
            tree={nodeTree}
            payload={payload}
            listing={{
              products: scoped,
              total,
              shown,
              facets,
              hasMore,
              nextPageHref,
              memberPricingAvailable: memberPricingEnabled,
              pricing: pricing as { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null },
              categoryName: category.name,
              categorySlug: category.slug ?? slug,
            }}
            namedStyles={namedStyles}
            components={components}
            jsFunctions={jsFunctions}
            callResults={callResults}
            draft={draft}
          />
        </>
      );
    }
  }

  // ═══ CMS category-layout TEMPLATE path (kill switch: flag off → legacy) ═══
  // The whole page as a block document (category_header / category_slot /
  // category_listing …); this route stays the data owner — the heavy queries
  // above are passed to the blocks via RenderContext extras.
  if (await getFeatureFlag("cms_category_layout_enabled")) {
    const template = await getCmsTemplate("category_layout", draft).catch(() => null);
    if (template && template.blocks.length > 0) {
      const context: RenderContext = {
        draft,
        record: {
          kind: "category",
          category: category as unknown as Record<string, unknown>,
          extras: {
            listing: { products, total, facets },
            pricing: pricing as unknown as Record<string, unknown>,
            memberPricingEnabled,
            breadcrumbs,
            page,
            hasMore,
            nextPageHref,
          },
        },
      };
      return (
        <div>
          <BlockRenderer
            blocks={template.blocks as unknown as RenderedBlock[]}
            draft={draft}
            context={context}
          />
        </div>
      );
    }
  }

  return (
    <div>
      {/* ═══ Branded banner ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-mid to-brand-deep">
        {category.image_url && (
          <>
            <Image
              src={category.image_url}
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-deep/80 to-brand-deep/40" />
          </>
        )}
        <div className="container-page relative py-10 lg:py-12">
          {/* Breadcrumb */}
          <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-white/70">
            <Link href="/" className="transition-colors hover:text-white">Home</Link>
            {breadcrumbs.slice(0, -1).map((crumb: { id: number; name: string; slug: string }) => (
              <span key={crumb.id} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" />
                <Link href={`/categories/${crumb.slug}`} className="transition-colors hover:text-white">
                  {crumb.name}
                </Link>
              </span>
            ))}
            <ChevronRight className="h-3 w-3" />
            <span className="text-white">{category.name}</span>
          </nav>

          <h1 className="heading-serif text-3xl text-white sm:text-4xl">{category.name}</h1>
          {category.description && (
            <RichContent
              html={category.description}
              stripStyles
              className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-white/85"
            />
          )}
          <span className="mt-3.5 inline-block rounded-full bg-white/[0.16] px-3 py-[5px] text-xs font-semibold text-white">
            {total} product{total === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      {/* ═══ CMS: above-listing content (empty unless set) ═══ */}
      {aboveBlocks.length > 0 && <BlockRenderer blocks={aboveBlocks} draft={draft} />}

      {/* ═══ Rail + grid ═══ */}
      <div className="container-page py-8">
        <div className="flex gap-6">
          <FilterRail facets={facets} />

          <div className="min-w-0 flex-1">
            {/* Toolbar — white card per design system (cat-toolbar, r12) */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-white px-4 py-[11px] shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13px] text-text-secondary">
                  Showing <b className="text-text-primary">1–{shown}</b> of <b className="text-text-primary">{total}</b>
                </p>
                <FilterChips facets={facets} />
              </div>
              <SortSelect />
            </div>

            <ProductGrid
              products={products}
              memberPricingAvailable={memberPricingEnabled}
              {...pricing}
              eyebrow={category.name}
              narrow
              listId={category.slug}
              listName={category.name}
            />

            {/* Load more */}
            {hasMore && (
              <div className="mt-10 text-center">
                <Link href={nextPageHref} scroll={false} className="btn-secondary">
                  Load more ({total - shown} remaining)
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ CMS: below-listing content (empty unless set) ═══ */}
      {belowBlocks.length > 0 && <BlockRenderer blocks={belowBlocks} draft={draft} />}
    </div>
  );
}
