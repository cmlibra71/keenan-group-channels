import { notFound } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getBrandBySlug, getBrandListing, getStorefrontFilters, getFeatureFlag } from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrandIntro } from "@/components/brand/BrandIntro";
import { BrandSearch } from "@/components/brand/BrandSearch";
import { BrandProductLines } from "@/components/brand/BrandProductLines";
import { BrandIndustryUses } from "@/components/brand/BrandIndustryUses";
import { BrandFaq } from "@/components/brand/BrandFaq";
import { BrandCategories } from "@/components/brand/BrandCategories";
import { FacetRail, FacetChips, SortSelect } from "@/components/category/FilterRail";
import { enabledFilterIds } from "@/lib/storefront-filters";
import { parsePriceBands, parseRangeParam } from "@/lib/category-attributes";
import { parseAttributeSelections } from "@keenan/services/services";
import {
  CATEGORY_PARAM,
  MAX_PAGES,
  PER_PAGE,
  attributeParamsOf,
  brandClearParams,
  brandFacetGroups,
  brandNextPageHref,
  parseBrandPage,
  parseBrandSort,
  parseIds,
  type BrandListingFacets,
  type BrandSearchParams,
} from "@/lib/brand-listing";

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

/**
 * The brand page lists the brand's CATEGORIES and its PRODUCTS, with the same
 * filters, sort and "Load more" the category page has (card xOBnQarT). Every
 * control on it is the category page's own component — `FacetRail`,
 * `FacetChips`, `SortSelect`, `ProductGrid` — driven by `lib/brand-listing.ts`;
 * there is deliberately no second listing implementation.
 */
export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<BrandSearchParams>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
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
    // A renamed brand address redirects rather than bare-404ing. (card EVvRDnZt)
    await redirectIfMapped(`/brands/${slug}`);
    notFound();
  }

  const page = parseBrandPage(sp.page);
  const sort = parseBrandSort(sp.sort);

  // This storefront's rail configuration (portal: Products > Filtering). A
  // switched-off facet must stop FILTERING, not merely displaying, so its URL
  // selections are dropped here before they reach the query — otherwise a
  // bookmarked link would narrow the listing with nothing on screen to explain
  // or clear it. (NfYe3P3G.) Brand is skipped outright: the page IS the brand.
  const storefrontFilters = await getStorefrontFilters();
  const filtersOn = enabledFilterIds(storefrontFilters);
  const categoryEnabled = filtersOn.has("sub");
  const priceEnabled = filtersOn.has("price");

  const rawPrice = priceEnabled ? sp.price : undefined;
  const priceBands = parsePriceBands(rawPrice) as ("lt1000" | "1000to3000" | "gt3000")[];
  const priceRange = priceBands.length === 0 ? parseRangeParam(rawPrice) : undefined;
  const attributeSelections = parseAttributeSelections(sp as Record<string, string | undefined>);
  const selectedCategoryIds = categoryEnabled ? parseIds(sp[CATEGORY_PARAM]) : [];

  // "Nothing here" and "nothing MATCHES" are different sentences: a brand with
  // no products at all is a fact about the catalogue, an empty filtered listing
  // is something the shopper can undo, and telling them the brand is empty when
  // it is not reads as a broken page. Decided BEFORE the reads because the hero's
  // unfiltered count is one of them.
  const filtered =
    selectedCategoryIds.length > 0 ||
    (priceEnabled && Boolean(rawPrice)) ||
    Object.keys(attributeSelections).length > 0;

  const [listing, memberPricingEnabled, unfiltered] = await Promise.all([
    getBrandListing(brand.id, {
      // Cumulative for Load more: each press re-asks for the SAME listing with a
      // bigger limit, and `total` + `facets` stay anchored to page 1 inside
      // getBrandListing so the toolbar's numbers do not move as the shopper pages.
      page: 1,
      limit: PER_PAGE * page,
      categoryIds: selectedCategoryIds,
      priceBands,
      priceRange,
      attributes: attributeSelections,
      sort,
    }),
    getFeatureFlag("member_pricing_enabled"),
    // The HERO states how many products the BRAND has; the toolbar states how
    // many match. They are the same number until something is ticked, and after
    // that they must not be: "Vogue — 0 products" beside a price filter reads as
    // "we do not stock Vogue", which is false. Only a filtered request pays for
    // the extra read, it is the same cache entry that shopper's own unfiltered
    // first load already populated, and it rides ALONGSIDE the listing rather
    // than after it — an extra serial round trip on the page Tim calls slow is
    // exactly the thing we are told not to add.
    filtered ? getBrandListing(brand.id, {}) : Promise.resolve(null),
  ]);

  const { products, total } = listing;
  const facets = listing.facets as unknown as BrandListingFacets;
  const groups = brandFacetGroups(facets, storefrontFilters, selectedCategoryIds);
  // Where a tile GOES depends on the rail configuration: with the Category
  // facet on it narrows this brand page, with it switched off it goes to the
  // category's own page rather than being a control that does nothing.
  const categoryTiles = facets.categories.map((category) => ({
    ...category,
    href: categoryEnabled
      ? `/brands/${slug}?${CATEGORY_PARAM}=${category.id}`
      : `/categories/${category.slug}`,
  }));
  const shown = products.length;
  const hasMore = shown < total && page < MAX_PAGES;

  const meta = ((brand.metafields as BrandMetafields | null) ?? {}) as BrandMetafields;
  const pageTitle = (brand.page_title as string | null) || (brand.name as string);

  const brandTotal = unfiltered ? unfiltered.total : total;

  const nextPageHref = brandNextPageHref({
    slug,
    searchParams: sp,
    page,
    categoryEnabled,
    priceEnabled,
    attributeParams: attributeParamsOf(facets),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
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
            {brandTotal} {brandTotal === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {/* The content block at the top of the brand page (card xvz6pXB4, Steve 2026-08-13).
          This site's OWN approved text wins; `metafields.intro_html` is the brand copy
          scraped from the old Industry Kitchens site, kept as the fallback so the 19 pages
          carrying it read exactly as they do today until wording is published for them. */}
      <BrandIntro html={brand.channel_intro_html || meta.intro_html} />

      {/* Search within this brand — a plain form onto the site search, narrowed
          to this brand (card 1RLP5nSJ). Only offered where there is something to
          search: a brand with no products would return nothing whatever is typed.
          Gated on the BRAND's total, not the filtered one: the search box is the
          shopper's way out of an empty result, so it must not be the thing that
          disappears with the results. */}
      {brandTotal > 0 && <BrandSearch brandName={brand.name as string} />}

      {/* Brand product lines (e.g. Rational iCombi Pro / Classic / Vario) */}
      <BrandProductLines heading="Product Lines" lines={meta.product_lines} />

      {/* ═══ The brand's categories ═══ A tile narrows this page while the
          Category facet is on; with it switched off the tile goes to the
          category's own page rather than being a control that does nothing. */}
      <div className="mt-12">
        <BrandCategories categories={categoryTiles} />
      </div>

      {/* ═══ Rail + grid ═══ */}
      <div className="flex gap-6">
        <FacetRail groups={groups} clearParams={brandClearParams(facets, storefrontFilters)} />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-zinc-600">
                Showing <b className="text-zinc-900">1–{shown}</b> of{" "}
                <b className="text-zinc-900">{total}</b>
              </p>
              <FacetChips groups={groups} />
            </div>
            <SortSelect />
          </div>

          {products.length > 0 ? (
            <ProductGrid
              products={products}
              memberPricingAvailable={memberPricingEnabled}
              memberPriceMap={await getListingMemberPrices(products)}
              listId={`brand_${brand.slug ?? brand.id}`}
              listName={brand.name}
            />
          ) : (
            <p className="text-zinc-500 text-center py-12">
              {filtered
                ? "No products match these filters."
                : "No products from this brand yet."}
            </p>
          )}

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

      {/* Industry-use tiles (e.g. Cafés / Restaurants / Hotels) */}
      <BrandIndustryUses heading="Top Use Cases" items={meta.industry_uses} />

      {/* Brand FAQ accordion */}
      <BrandFaq items={meta.faq} />
    </div>
  );
}
