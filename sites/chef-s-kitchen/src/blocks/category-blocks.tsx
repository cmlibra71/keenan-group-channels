// ============================================================================
// Category TEMPLATE blocks (page_kind 'category_layout') — Chef's Depot fork.
//
// Faithful extraction of app/categories/[slug]/page.tsx sections into
// RenderContext-driven system blocks. The live route precomputes the heavy
// data (filtered listing, pricing, breadcrumbs) into ctx.record.extras so the
// template costs the same queries as the hardcoded page; on the portal render
// surface (no route extras) each block self-fetches a page-1 default.
// Keep the JSX in exact sync with the legacy page until that path is deleted.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { RenderContext } from "@keenan/services";
import {
  getCategoryListing,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getCmsCategoryPage,
} from "@/lib/store";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

type BlockProps = { props: Record<string, unknown>; ctx?: RenderContext };

export type CategoryRecord = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  path_ids?: number[] | null;
};

export type CategoryListingData = {
  products: unknown[];
  total: number;
  facets: unknown;
};

/** Precomputed by the live category route; absent on the render surface. */
export type CategoryExtras = {
  listing?: CategoryListingData;
  pricing?: Record<string, unknown>;
  memberPricingEnabled?: boolean;
  breadcrumbs?: Array<{ id: number; name: string; slug: string }>;
  page?: number;
  hasMore?: boolean;
  nextPageHref?: string;
};

function categoryOf(ctx?: RenderContext): CategoryRecord | null {
  if (ctx?.record?.kind !== "category") return null;
  return ctx.record.category as CategoryRecord;
}

function extrasOf(ctx?: RenderContext): CategoryExtras {
  return (ctx?.record?.kind === "category" ? (ctx.record.extras as CategoryExtras) : undefined) ?? {};
}

const PER_PAGE = 24;

// ── Category header (branded banner incl. breadcrumb — CD design) ───────────

async function CategoryHeaderBlock({ props, ctx }: BlockProps) {
  const category = categoryOf(ctx);
  if (!category) return null;
  const extras = extrasOf(ctx);

  const [breadcrumbs, total] = await Promise.all([
    extras.breadcrumbs ??
      (getCategoryBreadcrumbs(category.path_ids || []) as Promise<
        Array<{ id: number; name: string; slug: string }>
      >),
    extras.listing
      ? Promise.resolve(extras.listing.total)
      : getCategoryListing(category.id, { page: 1, limit: 1 }).then((l) => l.total).catch(() => 0),
  ]);
  const showDescription = props.show_description !== false;

  return (
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
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-white/70">
          <Link href="/" className="transition-colors hover:text-white">Home</Link>
          {breadcrumbs.slice(0, -1).map((crumb) => (
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
        {showDescription && category.description && (
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
  );
}

// ── Product listing (filter rail + toolbar + grid + load-more) ──────────────

async function CategoryListingBlock({ ctx }: BlockProps) {
  const category = categoryOf(ctx);
  if (!category) return null;
  const extras = extrasOf(ctx);

  let listing = extras.listing;
  let pricing = extras.pricing;
  let memberPricingEnabled = extras.memberPricingEnabled;
  if (!listing) {
    // Render-surface fallback: unfiltered first page.
    try {
      listing = (await getCategoryListing(category.id, {
        page: 1,
        limit: PER_PAGE,
      })) as CategoryListingData;
    } catch {
      return null;
    }
  }
  if (pricing === undefined) {
    pricing = (await getListingPricing(listing.products as never)) as unknown as Record<
      string,
      unknown
    >;
  }
  if (memberPricingEnabled === undefined) {
    memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  }

  const { products, total, facets } = listing;
  const shown = products.length;
  const hasMore = extras.hasMore ?? false;

  return (
    <div className="container-page py-8">
      <div className="flex gap-6">
        <FilterRail facets={facets as never} />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-white px-4 py-[11px] shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-text-secondary">
                Showing <b className="text-text-primary">1–{shown}</b> of{" "}
                <b className="text-text-primary">{total}</b>
              </p>
              <FilterChips facets={facets as never} />
            </div>
            <SortSelect />
          </div>

          <ProductGrid
            products={products as never}
            memberPricingAvailable={memberPricingEnabled}
            {...(pricing as object)}
            eyebrow={category.name}
            narrow
          />

          {hasMore && extras.nextPageHref && (
            <div className="mt-10 text-center">
              <Link href={extras.nextPageHref} scroll={false} className="btn-secondary">
                Load more ({total - shown} remaining)
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-category content slot (existing above/below/banner region blocks) ───

async function CategorySlotBlock({ props, ctx }: BlockProps) {
  const category = categoryOf(ctx);
  if (!category) return null;
  const slotRegion = typeof props.slot_region === "string" ? props.slot_region : "above_listing";
  const doc = await getCmsCategoryPage(category.id, ctx?.draft ?? false).catch(() => null);
  const blocks = ((doc?.blocks as unknown as RenderedBlock[]) ?? []).filter(
    (b) => b.region === slotRegion
  );
  if (blocks.length === 0) return null;
  return <BlockRenderer blocks={blocks} draft={ctx?.draft ?? false} />;
}

export const CATEGORY_BLOCK_COMPONENTS = {
  category_header: CategoryHeaderBlock,
  category_listing: CategoryListingBlock,
  category_slot: CategorySlotBlock,
};
