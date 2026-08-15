import { notFound, redirect } from "next/navigation";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Package } from "lucide-react";
import {
  getCategoryBySlug,
  getCategoryListing,
  getStorefrontFilters,
  getSubcategories,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getCmsTemplate,
} from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { assertCategoryVisible } from "@/lib/catalog-scope";
import { redirectIfMapped } from "@/lib/redirect-seam";
import { applyStorefrontFilters, enabledFilterIds } from "@/lib/storefront-filters";
import {
  attributeParam,
  parseAttributeSelections,
} from "@keenan/services/services";
import { parsePriceBands, parseRangeParam } from "@/lib/category-attributes";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

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
 * Faceted category page: light header block, subcategory tiles, sticky
 * faceted filter rail, sort/result toolbar, grid beside the rail, and
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
    // A renamed or retired category redirects rather than bare-404ing, the same way a
    // retired product does. (card EVvRDnZt)
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

  const [listing, subcategories, breadcrumbs, memberPricingEnabled] = await Promise.all([
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
    getSubcategories(category.id),
    getCategoryBreadcrumbs(category.path_ids || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const { products, total } = listing;
  // Every renderer (sealed rail, CMS blocks, authored node tree) reads these
  // facets, so applying the configuration here is what switches a facet off
  // site-wide rather than in one component.
  const facets = applyStorefrontFilters(listing.facets, storefrontFilters);
  const memberPriceMap = await getListingMemberPrices(products);
  const shown = products.length;
  const hasMore = shown < total && page < MAX_PAGES;

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

  // ═══ CMS category-layout TEMPLATE path (kill switch: flag off → legacy) ═══
  // The whole page as a block document (category_header / category_slot /
  // category_listing …); this route stays the data owner — the heavy queries
  // above are passed to the blocks via RenderContext extras.
  if (await getFeatureFlag("cms_category_layout_enabled")) {
    const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
    const template = await getCmsTemplate("category_layout", draft).catch(() => null);
    if (template && template.blocks.length > 0) {
      const context: RenderContext = {
        draft,
        record: {
          kind: "category",
          category: category as unknown as Record<string, unknown>,
          extras: {
            listing: { products, total, facets },
            memberPriceMap,
            memberPricingEnabled,
            breadcrumbs,
            subcategories,
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* ═══ Light header block ═══ */}
      <div className="mb-8 rounded-2xl bg-zinc-50 px-6 py-8 sm:px-8">
        {/* Breadcrumb */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
          <Link href="/categories" className="hover:text-zinc-600">Categories</Link>
          {breadcrumbs.slice(0, -1).map((crumb: { id: number; name: string; slug: string }) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-zinc-700">{category.name}</span>
        </nav>

        <h1 className="text-3xl font-bold text-zinc-900">{category.name}</h1>
        {category.description && (
          <RichContent
            html={category.description}
            stripStyles
            className="mt-3 max-w-[70ch] text-zinc-600 leading-relaxed prose prose-sm prose-zinc"
          />
        )}
        <p className="mt-3 text-sm text-zinc-500">
          {total} product{total === 1 ? "" : "s"}
        </p>
      </div>

      {/* ═══ Subcategory tiles ═══ */}
      {subcategories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Subcategories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {subcategories.map((sub: { id: number; name: string; slug: string; imageUrl?: string | null }) => (
              <Link
                key={sub.id}
                href={`/categories/${sub.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 hover:shadow-sm transition-all"
              >
                {sub.imageUrl ? (
                  <div className="relative h-12 w-12 flex-shrink-0">
                    <Image
                      src={sub.imageUrl}
                      alt={sub.name}
                      fill
                      sizes="48px"
                      className="rounded object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Package className="h-5 w-5 text-zinc-300" />
                  </div>
                )}
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 line-clamp-2">
                  {sub.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Rail + grid ═══ */}
      <div className="flex gap-6">
        <FilterRail facets={facets} />

        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-zinc-600">
                Showing <b className="text-zinc-900">1–{shown}</b> of <b className="text-zinc-900">{total}</b>
              </p>
              <FilterChips facets={facets} />
            </div>
            <SortSelect />
          </div>

          <ProductGrid
            products={products}
            memberPricingAvailable={memberPricingEnabled}
            memberPriceMap={memberPriceMap}
            listId={category.slug}
            listName={category.name}
          />

          {/* Load more */}
          {hasMore && (
            <div className="mt-10 text-center">
              <Link
                href={nextPageHref}
                scroll={false}
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
              >
                Load more ({total - shown} remaining)
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
