import { Fragment } from "react";
import { notFound } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import type { Metadata } from "next";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  getBrandBySlug,
  getBrandListing,
  getProducts,
  getStorefrontFilters,
  getFeatureFlag,
  getCmsPage,
} from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import {
  brandNodePathApplies,
  renderBrandNodeBranch,
  type BrandListingPricing,
} from "@/builder/brand-node-branch";
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

/**
 * The brand page lists the brand's CATEGORIES and its PRODUCTS, with the same
 * filters, sort and "Load more" the category page has (card xOBnQarT). Every
 * control is the category page's own component — `FacetRail`, `FacetChips`,
 * `SortSelect` — driven by `lib/brand-listing.ts`; the grid stays whatever the
 * authored `brand_products` block renders, so nothing about the designed page
 * changes except that it is now filterable and pageable.
 *
 * When the AUTHORED brand tree renders the page instead, the listing furniture
 * is not on screen to drive, so the route hands that tree the load it has always
 * had — see `brandNodePathApplies`.
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
        /** This storefront's OWN approved page text (brand_channel_seo), as HTML. */
        channel_intro_html?: string | null;
      }
    | null;

  if (!brand) {
    // A renamed brand address redirects rather than bare-404ing. (card EVvRDnZt)
    await redirectIfMapped(`/brands/${slug}`);
    notFound();
  }

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
  // data owner and hands its own pricing shape in.
  //
  // That tree binds a plain product list and carries no filter rail, so it keeps
  // the load it has always had: asking for the faceted listing here would hand a
  // designed page 24 rows where it shows 48, with nothing on screen to page or
  // filter them. ═══
  if (await brandNodePathApplies({ brandCms, draft })) {
    const [{ products: nodeProducts, total: nodeTotal }, nodeMemberPricing] = await Promise.all([
      getProducts({ brandId: brand.id as number, limit: 48 }),
      getFeatureFlag("member_pricing_enabled"),
    ]);
    const nodeRendered = await renderBrandNodeBranch({
      brandCms,
      brand: brand as unknown as Record<string, unknown>,
      products: nodeProducts,
      total: nodeTotal,
      pricing: (await getListingPricing(nodeProducts)) as BrandListingPricing,
      memberPricingEnabled: nodeMemberPricing,
      draft,
    });
    if (nodeRendered) return nodeRendered;
  }

  const page = parseBrandPage(sp.page);
  const sort = parseBrandSort(sp.sort);

  // This storefront's rail configuration (portal: Products > Filtering). A
  // switched-off facet must stop FILTERING, not merely displaying, so its URL
  // selections are dropped before they reach the query (NfYe3P3G). Brand is
  // skipped outright: the page IS the brand.
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
  // is something the shopper can undo. Decided BEFORE the reads because the
  // hero's unfiltered count is one of them.
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

  const brandTotal = unfiltered ? unfiltered.total : total;

  const nextPageHref = brandNextPageHref({
    slug,
    searchParams: sp,
    page,
    categoryEnabled,
    priceEnabled,
    attributeParams: attributeParamsOf(facets),
  });

  const productCtx = {
    products,
    memberPricingAvailable: memberPricingEnabled,
    pricing: await getListingPricing(products),
  };
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
  // typed. It is gated on the BRAND's total, not the filtered one: the search box
  // is the shopper's way out of an empty result, so it must not be the thing that
  // disappears with the results.
  const heroExtras = (
    <>
      {intro}
      {brandTotal > 0 && <BrandSearch brandName={brand.name as string} />}
    </>
  );

  /**
   * The listing furniture the card asks for, wrapped around whichever grid the
   * authored `brand_products` block renders: the brand's category tiles above,
   * the category page's own rail beside it, its toolbar (count, chips, sort)
   * over it and its "Load more" under it. The block keeps its heading and its
   * grid — only what surrounds them is new.
   */
  const withListing = (node: React.ReactNode) => (
    <>
      {/* A tile narrows this page while the Category facet is on; with it
          switched off the tile goes to the category's own page rather than
          being a control that does nothing. */}
      <div className="mt-10">
        <BrandCategories categories={categoryTiles} />
      </div>

      <div className="flex gap-6">
        <FacetRail groups={groups} clearParams={brandClearParams(facets, storefrontFilters)} />

        <div className="min-w-0 flex-1">
          {/* Toolbar — the same white card the category page uses */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-white px-4 py-[11px] shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-text-secondary">
                Showing <b className="text-text-primary">1–{shown}</b> of{" "}
                <b className="text-text-primary">{total}</b>
              </p>
              <FacetChips groups={groups} />
            </div>
            <SortSelect />
          </div>

          {products.length === 0 && filtered ? (
            <p className="text-steel-500 text-center py-12">No products match these filters.</p>
          ) : (
            node
          )}

          {hasMore && (
            <div className="mt-10 text-center">
              <Link href={nextPageHref} scroll={false} className="btn-secondary">
                Load more ({total - shown} remaining)
              </Link>
            </div>
          )}
        </div>
      </div>
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
              <BrandHeroV2 key={i} props={b.props ?? {}} brand={brand} total={brandTotal} draft={draft} />
            );
          }
          return withIntro(<BrandHero key={i} brand={brand} total={brandTotal} />);
        }
        if (b.block_type === "brand_products") {
          const v2 =
            process.env.CMS_V2_DISABLED !== "1" &&
            ((Array.isArray(b.props?.subBlocks) && (b.props!.subBlocks as unknown[]).length > 0) ||
              draft ||
              process.env.CMS_V2_FORCE === "1");
          if (v2) {
            return withIntro(
              <Fragment key={i}>
                {withListing(
                  <BrandProductsV2
                    props={b.props ?? {}}
                    products={products as never}
                    pricing={productCtx.pricing}
                    memberPricingEnabled={memberPricingEnabled}
                    draft={draft}
                  />
                )}
              </Fragment>
            );
          }
          return withIntro(
            <Fragment key={i}>{withListing(<BrandProducts {...productCtx} />)}</Fragment>
          );
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
