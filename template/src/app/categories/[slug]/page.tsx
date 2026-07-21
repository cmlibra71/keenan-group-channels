import { notFound } from "next/navigation";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Package } from "lucide-react";
import {
  getCategoryBySlug,
  getCategoryListing,
  getSubcategories,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getCmsTemplate,
} from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { assertCategoryVisible } from "@/lib/catalog-scope";
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

  const [listing, subcategories, breadcrumbs, memberPricingEnabled] = await Promise.all([
    getCategoryListing(category.id, {
      page: 1,
      limit: PER_PAGE * page, // cumulative for Load more
      subcategoryIds: parseIds(sp.sub),
      brandIds: parseIds(sp.brand),
      priceBands,
      availability,
      sort,
    }),
    getSubcategories(category.id),
    getCategoryBreadcrumbs(category.path_ids || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const { products, total, facets } = listing;
  const memberPriceMap = await getListingMemberPrices(products);
  const shown = products.length;
  const hasMore = shown < total && page < MAX_PAGES;

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
