import { notFound, redirect } from "next/navigation";
import { draftMode, headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import {
  getCategoryBySlug,
  getCategoryListing,
  getStorefrontFilters,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getChannelSetting,
  getCmsCategoryPage,
  getCmsTemplate,
} from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getListingPricing } from "@/lib/member";
import { categoryRobots } from "@/lib/seo";
import { ProductGrid } from "@/components/product/ProductGrid";
import { assertCategoryVisible } from "@/lib/catalog-scope";
import { redirectIfMapped } from "@/lib/redirect-seam";
import { applyStorefrontFilters, enabledFilterIds } from "@/lib/storefront-filters";
import {
  attributeParam,
  parseAttributeSelections,
} from "@keenan/services/services";
import { parsePriceBands, parseRangeParam } from "@/lib/category-attributes";
import {
  renderCategoryNodeBranch,
  categoryTreePlacesSeoCopy,
  type CategoryListingPricing,
} from "@/builder/category-node-branch";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { CategorySeo } from "@/components/category/CategorySeo";

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
  const cat = category as {
    name: string;
    page_title?: string | null;
    meta_description?: string | null;
    seo_page_title?: string | null;
    seo_meta_description?: string | null;
  };
  // The storefront's own PUBLISHED wording wins (xvz6pXB4): the Category page SEO screen
  // is where per-site search wording is written and reviewed, and a reviewer there has to
  // be able to trust that what they publish is what Google sees. A CMS category page's
  // hand-typed meta stays as the next fallback, then the category record's own fields.
  return {
    title: cat.seo_page_title || meta.meta_title || cat.page_title || cat.name,
    description:
      cat.seo_meta_description || meta.meta_description || cat.meta_description || undefined,
    // A category kept out of search (include_in_search = false) says so to
    // crawlers as well as to the menu, /categories and the sitemap.
    robots: categoryRobots(category as { include_in_search?: boolean | null }),
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
  /** Per-category attribute filters arrive as `f_<code>` (C8G4f4U8). */
  [param: string]: string | undefined;
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
    // A renamed or retired category redirects rather than bare-404ing, the same way a
    // retired product does. The `category_redirects` channel setting above still runs
    // first — it is the older, hand-maintained map and nothing has migrated off it.
    // (card EVvRDnZt)
    await redirectIfMapped(`/categories/${slug}`);
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

  // This storefront's rail configuration (portal: Products > Filtering). A
  // switched-off facet must not filter either: its options are pruned from the
  // rail below, so a lingering ?brand= would narrow the listing with nothing on
  // screen explaining or clearing it.
  const storefrontFilters = await getStorefrontFilters();
  const filtersOn = enabledFilterIds(storefrontFilters);

  // Price is one facet with two notations: the slider writes `?price=1000-3000`
  // and the three legacy band tokens are still honoured, so a bookmark and the
  // authored Site Builder rail (which binds the bands) keep working. Both are
  // dropped when the facet is switched off — a switched-off facet must stop
  // FILTERING, not merely displaying (NfYe3P3G).
  const rawPrice = filtersOn.has("price") ? sp.price : undefined;
  const priceBands = parsePriceBands(rawPrice) as ("lt1000" | "1000to3000" | "gt3000")[];
  const priceRange = priceBands.length === 0 ? parseRangeParam(rawPrice) : undefined;

  // Attribute selections are read against the REGISTRY, not against the facets
  // this category happens to offer — the facets are a result of the very query
  // these selections go into. An attribute the category does not offer simply
  // matches nothing extra, because the products that would satisfy it are the
  // ones carrying the value.
  const attributeSelections = parseAttributeSelections(sp as Record<string, string | undefined>);
  const attributeParams = Object.keys(attributeSelections).map(attributeParam);
  // Availability is no longer a shopper-facing facet at all: "In stock" was
  // retired first and Clearance followed (clearance products are browsed via the
  // dedicated /clearance page). ANY ?stock= value — a bookmarked
  // ?stock=clearance or the older ?stock=in_stock — is dropped and the URL
  // canonicalised to the same category, so old links neither filter silently nor
  // leave an orphan chip in the toolbar. `stock` is never written back here:
  // doing so would redirect to itself forever.
  if (sp.stock !== undefined) {
    const next = new URLSearchParams(
      Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")
    );
    next.delete("stock");
    const qs = next.toString();
    redirect(`/categories/${slug}${qs ? `?${qs}` : ""}`);
  }

  const [listing, breadcrumbs, memberPricingEnabled] = await Promise.all([
    getCategoryListing(category.id, {
      page: 1,
      // Cumulative for Load more: each press re-asks for the SAME listing with a
      // bigger limit. `total` and `facets` below are therefore anchored to page 1
      // inside getCategoryListing — they must not move as the shopper pages.
      //
      // The counts the filter rail ADVERTISES come from the same `facets`, while
      // selecting a facet re-queries live. getCategoryListing now bounds how stale
      // the materialized base row may get (refreshed in the background once it
      // passes the live listings' own TTL), so "Stoddart (43)" and "showing 31"
      // can no longer disagree.
      limit: PER_PAGE * page,
      subcategoryIds: filtersOn.has("sub") ? parseIds(sp.sub) : [],
      brandIds: filtersOn.has("brand") ? parseIds(sp.brand) : [],
      priceBands,
      priceRange,
      attributes: attributeSelections,
      // No `availability` — the shopper can no longer filter on it (the option
      // stays in the data layer, unused by this route).
      sort,
    }),
    getCategoryBreadcrumbs(category.path_ids || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const { products, total } = listing;
  // Every renderer (sealed rail, CMS blocks, authored node tree) reads these
  // facets, so applying the configuration here is what switches a facet off
  // site-wide rather than in one component.
  const facets = applyStorefrontFilters(listing.facets, storefrontFilters);
  const pricing = await getListingPricing(products);
  const shown = products.length;
  const hasMore = shown < total && page < MAX_PAGES;

  // Editable CMS content zones around the (system) listing. Empty when no CMS
  // category page is set — so the page renders exactly as before.
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  // Both of these are per-request cached loads that only need `draft`, so they go
  // together rather than one after the other — "as long as it's fast to open".
  const [cmsCat, seoCopyPlacedInTree] = await Promise.all([
    getCmsCategoryPage(category.id, draft).catch(() => null),
    // Does the authored Category Page Template PLACE this storefront's own
    // approved wording itself (card nYxPgpvK)? The payload carries it as
    // `category.seo_intro_html`, so a page can put it in the header or anywhere
    // else; printing the same paragraphs again at the foot would duplicate body
    // copy across every category page, which is the cannibalisation this content
    // exists to avoid. The QUESTIONS are not placeable and stay where they are.
    categoryTreePlacesSeoCopy(draft),
  ]);
  const region = (r: string): RenderedBlock[] =>
    ((cmsCat?.blocks as unknown as RenderedBlock[]) ?? []).filter((b) => b.region === r);
  const aboveBlocks = region("above_listing");
  const belowBlocks = region("below_listing");

  // Bottom-of-page SEO content for this storefront (xvz6pXB4). Absent unless somebody has
  // PUBLISHED it: the overlay only reads approved rows, so a category with nothing
  // published renders no block at all.
  const seo = category as unknown as {
    channel_seo_intro_html?: string;
    channel_seo_faq?: { question: string; answer_html: string; answer_text: string }[];
    channel_seo_faq_jsonld?: string;
  };
  const categorySeo = (
    <CategorySeo
      introHtml={seoCopyPlacedInTree ? undefined : seo.channel_seo_intro_html}
      faq={seo.channel_seo_faq}
      faqJsonLd={seo.channel_seo_faq_jsonld}
      categoryName={category.name}
    />
  );

  const nextPageHref = (() => {
    const next = new URLSearchParams();
    if (sp.sub && filtersOn.has("sub")) next.set("sub", sp.sub);
    if (sp.brand && filtersOn.has("brand")) next.set("brand", sp.brand);
    if (sp.price && filtersOn.has("price")) next.set("price", sp.price);
    for (const param of attributeParams) {
      const value = sp[param];
      if (value) next.set(param, value);
    }
    if (sp.sort) next.set("sort", sp.sort);
    next.set("page", String(page + 1));
    return `/categories/${slug}?${next.toString()}`;
  })();

  // ═══ Site Builder node path — the 'category_layout' template authored in
  // the node designer. The body of this branch used to live here, and only
  // here, which is why Industry Kitchens could not have one; it is now engine
  // (src/builder/category-node-branch.tsx) shared by both sites. The route
  // stays data owner and hands its own listing and pricing in. ═══
  {
    const nodeRendered = await renderCategoryNodeBranch({
      category: category as unknown as Record<string, unknown> & { id: number; name: string; slug?: string | null },
      products,
      total,
      shown,
      facets,
      page,
      hasMore,
      nextPageHref,
      sort,
      pricing: pricing as CategoryListingPricing,
      breadcrumbs: breadcrumbs as { id: number; name: string; slug: string }[],
      selections: {
        // Same gate as the query above: a switched-off facet's selections are
        // dropped, so the authored rail never shows a ticked box or a chip for
        // a filter that is no longer applied.
        sub: filtersOn.has("sub") ? (sp.sub?.split(",").filter(Boolean) ?? []) : [],
        brand: filtersOn.has("brand") ? (sp.brand?.split(",").filter(Boolean) ?? []) : [],
        price: filtersOn.has("price") ? (sp.price?.split(",").filter(Boolean) ?? []) : [],
        // Attribute windows and ticked values, so an authored rail can show
        // them as selected and the toolbar chips can name them.
        attributes: attributeSelections,
        // Always empty: availability is no longer a filter, and a ?stock= value
        // never reaches here (it is redirected away above). Keeping the key
        // explicit stops the authored rail's `selected` state and its active-
        // filter chips from ever lighting up on stock.
        stock: [],
      },
      memberPricingEnabled,
      categorySlugFallback: slug,
      draft,
    });
    // The authored tree owns the page, so the SEO block is appended AFTER it rather than
    // squeezed inside: Steve asked for bottom-of-page content, and the foot of the page is
    // the same place whichever branch drew the rest of it.
    if (nodeRendered)
      return (
        <>
          {nodeRendered}
          {categorySeo}
        </>
      );
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
          {categorySeo}
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
              className="mt-2 max-w-none text-[15px] leading-relaxed text-white/85 kg-category-copy"
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

      {/* ═══ Bottom-of-page SEO content (xvz6pXB4) — last thing on the page, and
          nothing at all until a person has published it for this storefront ═══ */}
      {categorySeo}
    </div>
  );
}
