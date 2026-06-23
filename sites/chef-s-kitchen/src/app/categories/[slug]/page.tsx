import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import {
  getCategoryBySlug,
  getCategoryListing,
  getSubcategories,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getChannelSetting,
} from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";

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
    getCategoryBreadcrumbs(category.pathIds || []),
    getFeatureFlag("member_pricing_enabled"),
  ]);

  const { products, total, facets } = listing;
  const pricing = await getListingPricing(products);
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

  return (
    <div>
      {/* ═══ Branded banner ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-mid to-brand-deep">
        {category.imageUrl && (
          <>
            <Image
              src={category.imageUrl}
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

      {/* ═══ Browse subcategories — design catcards (mirrors homepage "Shop by Category") ═══ */}
      {subcategories.length > 0 && (
        <section className="container-page pt-8">
          <p className="eyebrow mb-3">Browse</p>
          <h2 className="section-title mb-6">Shop by subcategory</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {subcategories.map((sub: { id: number; name: string; slug: string; imageUrl?: string | null }) => (
              <Link
                key={sub.id}
                href={`/categories/${sub.slug}`}
                className="group overflow-hidden rounded-card border border-border bg-white transition-all duration-200 hover:-translate-y-[3px] hover:border-brand-light hover:shadow-hover"
              >
                <div className="relative aspect-[4/3] bg-gradient-to-br from-brand-tint to-steel-200">
                  {sub.imageUrl && (
                    <Image
                      src={sub.imageUrl}
                      alt={sub.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-[15px]">
                  <b className="text-[15px] font-bold text-text-primary">{sub.name}</b>
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-brand-tint text-brand-deep transition-colors duration-200 group-hover:bg-accent group-hover:text-white">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
    </div>
  );
}
