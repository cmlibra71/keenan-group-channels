// ============================================================================
// Category TEMPLATE blocks (page_kind 'category_layout') — IK/template fork.
//
// Faithful extraction of app/categories/[slug]/page.tsx sections into
// RenderContext-driven system blocks. The live route precomputes the heavy
// data (filtered listing, member prices, breadcrumbs, subcategories) into
// ctx.record.extras so the template costs the same queries as the hardcoded
// page; on the portal render surface (no route extras) blocks self-fetch a
// page-1 default. Keep the JSX in exact sync with the legacy page until that
// path is deleted.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Package } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/image-origin";
import type { CategoryChildSlim, RenderContext } from "@keenan/services";
import {
  getCategoryListing,
  getSubcategories,
  getCategoryBreadcrumbs,
  getFeatureFlag,
  getCmsCategoryPage,
} from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, effectiveSubBlocks, type RenderedBlock } from "@/blocks/BlockRenderer";
import { TemplateRenderer } from "@/blocks/TemplateRenderer";
import { WIDGETS } from "@/blocks/widgets";
import {
  BLOCK_REGISTRY,
  evaluateConditions,
  sanitizeConditions,
  type SubBlockInstance,
  type ConditionContext,
} from "@keenan/services";
import { buildBindingData } from "@/blocks/binding-data";
import { buildConditionContext } from "@/lib/condition-context";
import { buildPartialResolver, CHANNEL_KEY } from "@/blocks/partials";

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
  memberPriceMap?: Record<number, number>;
  memberPricingEnabled?: boolean;
  breadcrumbs?: Array<{ id: number; name: string; slug: string }>;
  /** As `getSubcategories` returns them: snake_cased, `image_url` (card 7LjU5UDE). */
  subcategories?: CategoryChildSlim[];
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


// ── CMS v2 helpers (custom compositions render sub-blocks in slots) ─────────

const CMS_V2_ON = (props: Record<string, unknown>, ctx?: RenderContext): boolean =>
  process.env.CMS_V2_DISABLED !== "1" &&
  ((Array.isArray(props.subBlocks) && (props.subBlocks as unknown[]).length > 0) ||
    ctx?.draft === true ||
    process.env.CMS_V2_FORCE === "1");

type V2Env = {
  subBlocks: SubBlockInstance[];
  data: Record<string, unknown>;
  condCtx: ConditionContext;
  resolvePartial: Awaited<ReturnType<typeof buildPartialResolver>>;
};

async function v2Env(blockType: string, props: Record<string, unknown>, ctx?: RenderContext): Promise<V2Env> {
  const def = BLOCK_REGISTRY[blockType];
  const [condCtx, resolvePartial] = await Promise.all([
    buildConditionContext(ctx),
    buildPartialResolver(ctx),
  ]);
  return {
    subBlocks: effectiveSubBlocks(props, def?.subBlockSchema, CHANNEL_KEY),
    data: buildBindingData(ctx),
    condCtx,
    resolvePartial,
  };
}

function renderSub(env: V2Env, sb: SubBlockInstance, ctx?: RenderContext): React.ReactNode {
  if (sb.hidden && !ctx?.draft) return null;
  if (!evaluateConditions(sanitizeConditions(sb.conditions), env.condCtx)) return null;
  if (sb.kind === "widget" && sb.widget) {
    const Widget = WIDGETS[sb.widget.name];
    return Widget ? <Widget attrs={sb.widget.attrs ?? {}} ctx={ctx} /> : null;
  }
  return (
    <TemplateRenderer
      template={sb.template ?? ""}
      data={env.data}
      ctx={ctx}
      channelKey={CHANNEL_KEY}
      resolvePartial={env.resolvePartial}
      draft={ctx?.draft ?? false}
    />
  );
}

const PER_PAGE = 24;
const CONTAINER = "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8";

// ── Category header (light header card + optional subcategory tiles) ────────

async function CategoryHeaderBlock({ props, ctx }: BlockProps) {
  const category = categoryOf(ctx);
  if (!category) return null;
  const extras = extrasOf(ctx);

  // CMS v2.1: editable title/description/count inside the component-owned
  // zinc header box; breadcrumbs stay a locked widget; subcategories grid
  // stays component-owned.
  if (CMS_V2_ON(props, ctx)) {
    const env = await v2Env("category_header", props, ctx);
    const crumbSb = env.subBlocks.find((sb) => sb.key === "header_breadcrumbs");
    const rest = env.subBlocks.filter((sb) => sb.key !== "header_breadcrumbs");
    const breadcrumbs =
      extras.breadcrumbs ??
      ((await getCategoryBreadcrumbs(category.path_ids || []).catch(() => [])) as Array<{
        id: number;
        name: string;
        slug: string;
      }>);
    return (
      <div className={`${CONTAINER} pt-8`}>
        <div className="mb-8 rounded-2xl bg-zinc-50 px-6 py-8 sm:px-8">
          {crumbSb && !crumbSb.hidden && (
            <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
              <Link href="/categories" className="hover:text-zinc-600">Categories</Link>
              {breadcrumbs.slice(0, -1).map((crumb) => (
                <span key={crumb.id} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5" />
                  <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
                </span>
              ))}
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-zinc-700">{category.name}</span>
            </nav>
          )}
          {rest.map((sb) => (
            <div key={sb.id} data-cms-subblock-key={ctx?.draft ? sb.key : undefined}>
              {renderSub(env, sb, ctx)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const [breadcrumbs, total, subcategories] = await Promise.all([
    extras.breadcrumbs ??
      (getCategoryBreadcrumbs(category.path_ids || []) as Promise<
        Array<{ id: number; name: string; slug: string }>
      >),
    extras.listing
      ? Promise.resolve(extras.listing.total)
      : getCategoryListing(category.id, { page: 1, limit: 1 }).then((l) => l.total).catch(() => 0),
    extras.subcategories ?? getSubcategories(category.id),
  ]);
  const showDescription = props.show_description !== false;
  const showSubcategories = props.show_subcategories !== false;

  return (
    <div className={`${CONTAINER} pt-8`}>
      <div className="mb-8 rounded-2xl bg-zinc-50 px-6 py-8 sm:px-8">
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
          <Link href="/categories" className="hover:text-zinc-600">Categories</Link>
          {breadcrumbs.slice(0, -1).map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-zinc-700">{category.name}</span>
        </nav>

        <h1 className="text-3xl font-bold text-zinc-900">{category.name}</h1>
        {showDescription && category.description && (
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

      {showSubcategories && subcategories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Subcategories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {subcategories.map((sub) => (
              <Link
                key={sub.id}
                href={`/categories/${sub.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 hover:shadow-sm transition-all"
              >
                {sub.image_url && isAllowedImageUrl(sub.image_url) ? (
                  <div className="relative h-12 w-12 flex-shrink-0">
                    <Image src={sub.image_url} alt={sub.name} fill sizes="48px" className="rounded object-cover" />
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
    </div>
  );
}

// ── Product listing (filter rail + toolbar + grid + load-more) ──────────────

async function CategoryListingBlock({ props, ctx }: BlockProps) {
  const category = categoryOf(ctx);
  if (!category) return null;
  const extras = extrasOf(ctx);

  // CMS v2.1: rail + column arrangement stays component-owned; toolbar is an
  // editable template; rail/grid/load-more render as locked widgets.
  if (CMS_V2_ON(props, ctx)) {
    const env = await v2Env("category_listing", props, ctx);
    const rail = env.subBlocks.find((sb) => sb.key === "filter_rail");
    const rest = env.subBlocks.filter((sb) => sb.key !== "filter_rail");
    const facets = extras.listing?.facets;
    return (
      <div className={`${CONTAINER} pb-8`}>
        <div className="flex gap-6">
          {rail && !rail.hidden && facets ? <FilterRail facets={facets as never} /> : null}
          <div className="min-w-0 flex-1">
            {rest.map((sb) => {
              // load_more / filter widgets have no template impls here yet —
              // render toolbar template + listing grid; others no-op safely.
              return (
                <div key={sb.id} data-cms-subblock-key={ctx?.draft ? sb.key : undefined}>
                  {renderSub(env, sb, ctx)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  let listing = extras.listing;
  let memberPriceMap = extras.memberPriceMap;
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
  if (memberPriceMap === undefined) {
    memberPriceMap = (await getListingMemberPrices(listing.products as never)) as Record<number, number>;
  }
  if (memberPricingEnabled === undefined) {
    memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  }

  const { products, total, facets } = listing;
  const shown = products.length;
  const hasMore = extras.hasMore ?? false;

  return (
    <div className={`${CONTAINER} pb-8`}>
      <div className="flex gap-6">
        <FilterRail facets={facets as never} />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-zinc-600">
                Showing <b className="text-zinc-900">1–{shown}</b> of <b className="text-zinc-900">{total}</b>
              </p>
              <FilterChips facets={facets as never} />
            </div>
            <SortSelect />
          </div>

          <ProductGrid
            products={products as never}
            memberPricingAvailable={memberPricingEnabled}
            memberPriceMap={memberPriceMap}
            listId={category.slug}
            listName={category.name}
          />

          {hasMore && extras.nextPageHref && (
            <div className="mt-10 text-center">
              <Link
                href={extras.nextPageHref}
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
  // Same container the legacy page rendered the per-category regions inside.
  return (
    <div className={CONTAINER}>
      <BlockRenderer blocks={blocks} draft={ctx?.draft ?? false} />
    </div>
  );
}

export const CATEGORY_BLOCK_COMPONENTS = {
  category_header: CategoryHeaderBlock,
  category_listing: CategoryListingBlock,
  category_slot: CategorySlotBlock,
};
