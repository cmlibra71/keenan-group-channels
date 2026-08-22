import "server-only";

// ============================================================================
// CMS v2 SERVER widgets — Chef's Depot fork.
//
// Widgets that fetch data / render partials on the server (unlike the client
// widgets in widgets-client.tsx). product_grid renders a responsive grid of
// the shared editable `product_card` PARTIAL — each card wrapped in its own
// lightweight ProductPurchaseProvider so the locked price/cart/quote widgets
// inside the card work per product (same components as the PDP).
// ============================================================================

import type { RenderContext } from "@keenan/services";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  getProducts,
  getCategoryBySlug,
  getCategoryListing,
  getCategoryBreadcrumbs,
  getRelatedProducts,
  getFeatureFlag,
} from "@/lib/store";
import { FilterRail, FilterChips, SortSelect } from "@/components/category/FilterRail";
import { getListingPricing, applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import {
  ProductPurchaseProvider,
  type PurchaseProduct,
} from "@/components/product/ProductPurchaseProvider";
import { TemplateRenderer } from "./TemplateRenderer";
import { getPartialSource, buildPartialResolver } from "./partials";
import { productCardData } from "./binding-data";
import imageLoader from "@/lib/image-loader";

type AnyRecord = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Minimal per-card provider payload (no variants/options on listing cards). */
function cardPurchaseProduct(p: AnyRecord): PurchaseProduct {
  return {
    id: p.id as number,
    name: (p.name as string) ?? "",
    sku: (p.sku as string) ?? null,
    price: (p.price as string) ?? "0",
    salePrice: (p.salePrice as string) ?? null,
    inventoryLevel: (p.inventoryLevel as number) ?? 0,
    inventoryTracking: (p.inventoryTracking as string) ?? "none",
    // Per-product buying controls (card 7vu2iEEZ). Unset reads as today's behaviour.
    backorderPolicy: (p.backorderPolicy as string) ?? null,
    restrictAddToQuote: p.restrictAddToQuote === true,
    restrictAddToCart: p.restrictAddToCart === true,
    hidePrice: p.hidePrice === true,
    availability: (p.availability as string) ?? "available",
    descriptionShort: null,
    images: [],
    variants: [],
    options: [],
    optionValues: [],
    variantOptionMappings: [],
    bulkPricing: [],
  };
}

/** next/Image-equivalent URLs via THIS fork's custom image loader, so
 *  partial-rendered <img> cards hit the same /api/image pipeline (size +
 *  format) as the legacy next/Image cards. Widths from next.config's ladder. */
const IMG_WIDTHS = [200, 400, 800] as const;
function optimizedImg(raw: string, w: number): string {
  return imageLoader({ src: raw, width: w, quality: 80 });
}
function imageFields(raw: string | null): { imageUrl: string | null; imageSrcset: string | null } {
  if (!raw) return { imageUrl: null, imageSrcset: null };
  return {
    imageUrl: optimizedImg(raw, 400),
    imageSrcset: IMG_WIDTHS.map((w) => `${optimizedImg(raw, w)} ${w}w`).join(", "),
  };
}

/** Card data: productCardData + the computed display flags the seed branches on. */
function cardData(p: AnyRecord, opts: { eyebrow?: string | null; clearance?: boolean }): AnyRecord {
  const base = productCardData(p);
  const rrp = typeof base.price === "number" ? (base.price as number) : 0;
  const sale = typeof base.salePrice === "number" ? (base.salePrice as number) : null;
  const hasPrice = Number.isFinite(rrp) && rrp > 0;
  const savePct = sale && rrp > 0 ? Math.round(((rrp - sale) / rrp) * 100) : 0;
  const tracking = (p.inventoryTracking as string) ?? "none";
  const tracked = tracking !== "none";
  const level = (p.inventoryLevel as number) ?? 0;
  const lowStock = tracked && level > 0 && level <= 3;
  const outOfStock = (p.availability as string) === "disabled" || (tracked && level <= 0);
  const showSaveBadge = savePct >= 5;
  const showClearanceBadge = opts.clearance === true;
  const rawImage =
    ((p.thumbnailImage as AnyRecord | null)?.urlThumbnail as string) ??
    ((p.thumbnailImage as AnyRecord | null)?.urlStandard as string) ??
    (base.imageUrl as string | null);
  return {
    ...base,
    ...imageFields(rawImage),
    eyebrow: opts.eyebrow ?? null,
    savePct,
    buyable: hasPrice && !outOfStock,
    outOfStock,
    showSaveBadge,
    showClearanceBadge,
    showLowStockBadge: !showSaveBadge && !showClearanceBadge && lowStock,
  };
}

async function fetchGridProducts(
  attrs: AnyRecord,
  ctx?: RenderContext
): Promise<AnyRecord[]> {
  const source = str(attrs.source) || "related";
  const limit = num(attrs.limit, 8);
  try {
    if (source === "related") {
      if (ctx?.record?.kind !== "product") return [];
      const product = ctx.record.product as AnyRecord;
      const extras = (ctx.record.extras ?? {}) as AnyRecord;
      const related =
        (extras.relatedProducts as AnyRecord[]) ??
        ((await getRelatedProducts(
          product.id as number,
          (product.categoryIds as number[]) ?? []
        )) as AnyRecord[]);
      return related.slice(0, limit);
    }
    if (source === "featured") {
      const { products } = await getProducts({ featured: true, limit });
      return products as AnyRecord[];
    }
    if (source === "onSale") {
      const { products } = await getProducts({ onSale: true, limit });
      return products as AnyRecord[];
    }
    if (source === "category" && str(attrs.category_slug)) {
      const cat = await getCategoryBySlug(str(attrs.category_slug));
      if (!cat) return [];
      const { products } = await getCategoryListing(cat.id, { limit });
      return products as AnyRecord[];
    }
  } catch {
    return [];
  }
  return [];
}

/** Grid of cards rendered from the shared product_card partial — each card in
 *  its own lightweight purchase provider. Reused by product_grid/listing_grid
 *  widgets and the brand page. */
export async function CardPartialGrid({
  products,
  ctx,
  cardKey = "product_card",
  cardTemplate,
  eyebrow = null,
  clearance = false,
  narrow = false,
  pricing,
  memberPricingEnabled,
  gridClassName,
}: {
  products: AnyRecord[];
  ctx?: RenderContext;
  cardKey?: string;
  cardTemplate?: string | null;
  eyebrow?: string | null;
  clearance?: boolean;
  narrow?: boolean;
  pricing?: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  memberPricingEnabled?: boolean;
  gridClassName?: string;
}) {
  if (products.length === 0) return null;
  // Hide before pricing: the shopper's VISIBILITY scope, then their account prices — both applied
  // at read time to rows that came out of the SHARED cache / Meili index (never written back).
  products = (await applyCatalogScope(products as never)) as typeof products;
  if (products.length === 0) return null;
  products = (await applyAccountPrices(products as never)) as typeof products;
  const [cardSource, resolvePartial, pricingResolved, mpe] = await Promise.all([
    cardTemplate ? Promise.resolve(cardTemplate) : getPartialSource(cardKey, ctx),
    buildPartialResolver(ctx),
    pricing !== undefined
      ? Promise.resolve(pricing)
      : getListingPricing(products as never)
          .then((p) => p as unknown as Record<string, unknown>)
          .catch(() => ({}) as Record<string, unknown>),
    memberPricingEnabled !== undefined
      ? Promise.resolve(memberPricingEnabled)
      : getFeatureFlag("member_pricing_enabled").catch(() => false),
  ]);
  if (!cardSource) return null;

  const memberPriceMap = (pricingResolved.memberPriceMap ?? {}) as Record<number, number>;
  const isMember = (pricingResolved.isMember as boolean) ?? false;
  const planPrice = (pricingResolved.planPrice as string | null) ?? null;

  return (
    <div
      className={
        gridClassName ??
        `grid grid-cols-2 gap-3 sm:gap-4 ${narrow ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"}`
      }
    >
      {products.map((p) => {
        const memberPrice = mpe ? memberPriceMap[p.id as number] ?? null : null;
        return (
          <ProductPurchaseProvider
            key={p.id as number}
            product={cardPurchaseProduct(p)}
            memberPrice={memberPrice}
            isMember={isMember}
            membershipTeaser={planPrice ? { fromPrice: parseFloat(planPrice).toFixed(2) } : null}
          >
            <TemplateRenderer
              template={cardSource}
              data={{ product: cardData(p, { eyebrow, clearance }) }}
              ctx={ctx}
              seedKey={`partial/${cardKey}`}
              channelKey="chef-s-kitchen"
              resolvePartial={resolvePartial}
              draft={ctx?.draft ?? false}
            />
          </ProductPurchaseProvider>
        );
      })}
    </div>
  );
}

export async function ProductGridWidget({
  attrs,
  ctx,
}: {
  attrs: Record<string, unknown>;
  ctx?: RenderContext;
}) {
  let products = await fetchGridProducts(attrs, ctx);
  if (products.length === 0) return null;
  // Hide before pricing: the shopper's VISIBILITY scope, then their account prices — both applied
  // at read time to rows that came out of the SHARED cache / Meili index (never written back).
  products = (await applyCatalogScope(products as never)) as typeof products;
  if (products.length === 0) return null;
  products = (await applyAccountPrices(products as never)) as typeof products;

  const cardKey = str(attrs.card) || "product_card";
  // detached card: an inline KTL override stored on THIS block (attrs.card_template)
  const detached = str(attrs.card_template);
  const [cardSource, resolvePartial, pricing, memberPricingEnabled] = await Promise.all([
    detached ? Promise.resolve(detached) : getPartialSource(cardKey, ctx),
    buildPartialResolver(ctx),
    // member pricing — same model as the legacy ProductGrid path
    (async () => {
      const extras =
        ctx?.record?.kind === "product" ? ((ctx.record.extras ?? {}) as AnyRecord) : {};
      if (attrs.source === "related" && extras.relatedPricing !== undefined) {
        return extras.relatedPricing as {
          memberPriceMap?: Record<number, number>;
          isMember?: boolean;
          planPrice?: string | null;
        };
      }
      return getListingPricing(products as never).catch(() => ({}) as Record<string, never>);
    })(),
    getFeatureFlag("member_pricing_enabled").catch(() => false),
  ]);
  if (!cardSource) return null;

  const memberPriceMap = (pricing.memberPriceMap ?? {}) as Record<number, number>;
  const isMember = pricing.isMember ?? false;
  const planPrice = pricing.planPrice ?? null;
  const narrow = attrs.narrow === true;
  const eyebrow = str(attrs.eyebrow) || null;
  const clearance = attrs.clearance === true;

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${
        narrow ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"
      }`}
    >
      {products.map((p) => {
        const memberPrice = memberPricingEnabled ? memberPriceMap[p.id as number] ?? null : null;
        return (
          <ProductPurchaseProvider
            key={p.id as number}
            product={cardPurchaseProduct(p)}
            memberPrice={memberPrice}
            isMember={isMember}
            membershipTeaser={planPrice ? { fromPrice: parseFloat(planPrice).toFixed(2) } : null}
          >
            <TemplateRenderer
              template={cardSource}
              data={{ product: cardData(p, { eyebrow, clearance }) }}
              ctx={ctx}
              seedKey={`partial/${cardKey}`}
              channelKey="chef-s-kitchen"
              resolvePartial={resolvePartial}
              draft={ctx?.draft ?? false}
            />
          </ProductPurchaseProvider>
        );
      })}
    </div>
  );
}


// ── Category widgets (URL-state components + listing grid via the card) ─────

type CategoryExtrasShape = {
  listing?: { products: AnyRecord[]; total: number; facets?: unknown };
  pricing?: Record<string, unknown>;
  memberPricingEnabled?: boolean;
  breadcrumbs?: Array<{ id: number; name: string; slug: string }>;
  hasMore?: boolean;
  nextPageHref?: string;
};

function categoryExtras(ctx?: RenderContext): CategoryExtrasShape {
  return ctx?.record?.kind === "category"
    ? ((ctx.record.extras ?? {}) as CategoryExtrasShape)
    : {};
}

export async function BreadcrumbsWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  if (ctx?.record?.kind !== "category") return null;
  const category = ctx.record.category as AnyRecord;
  const extras = categoryExtras(ctx);
  const breadcrumbs =
    extras.breadcrumbs ??
    ((await getCategoryBreadcrumbs((category.path_ids as number[]) || []).catch(() => [])) as Array<{
      id: number;
      name: string;
      slug: string;
    }>);
  return (
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
      <span className="text-white">{category.name as string}</span>
    </nav>
  );
}

export function FilterRailWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  const extras = categoryExtras(ctx);
  if (!extras.listing?.facets) return null;
  return <FilterRail facets={extras.listing.facets as never} />;
}

export function FilterChipsWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  const extras = categoryExtras(ctx);
  if (!extras.listing?.facets) return null;
  return <FilterChips facets={extras.listing.facets as never} />;
}

export function SortSelectWidget() {
  return <SortSelect />;
}

/** The category listing grid — same card-partial pipeline as product_grid. */
export async function ListingGridWidget({
  attrs,
  ctx,
}: {
  attrs: Record<string, unknown>;
  ctx?: RenderContext;
}) {
  if (ctx?.record?.kind !== "category") return null;
  const category = ctx.record.category as AnyRecord;
  const extras = categoryExtras(ctx);

  let listing = extras.listing;
  if (!listing) {
    try {
      listing = (await getCategoryListing(category.id as number, { page: 1, limit: 24 })) as {
        products: AnyRecord[];
        total: number;
      };
    } catch {
      return null;
    }
  }
  let products = listing.products ?? [];
  if (products.length === 0) return null;
  // Hide before pricing: the shopper's VISIBILITY scope, then their account prices — both applied
  // at read time to rows that came out of the SHARED cache / Meili index (never written back).
  products = (await applyCatalogScope(products as never)) as typeof products;
  if (products.length === 0) return null;
  products = (await applyAccountPrices(products as never)) as typeof products;

  const cardKey = str(attrs.card) || "product_card";
  const detached = str(attrs.card_template);
  const [cardSource, resolvePartial, pricing, memberPricingEnabled] = await Promise.all([
    detached ? Promise.resolve(detached) : getPartialSource(cardKey, ctx),
    buildPartialResolver(ctx),
    extras.pricing !== undefined
      ? Promise.resolve(extras.pricing as Record<string, unknown>)
      : (getListingPricing(products as never) as Promise<unknown> as Promise<
          Record<string, unknown>
        >).catch(() => ({}) as Record<string, unknown>),
    extras.memberPricingEnabled !== undefined
      ? Promise.resolve(extras.memberPricingEnabled)
      : getFeatureFlag("member_pricing_enabled").catch(() => false),
  ]);
  if (!cardSource) return null;

  const memberPriceMap = (pricing.memberPriceMap ?? {}) as Record<number, number>;
  const isMember = (pricing.isMember as boolean) ?? false;
  const planPrice = (pricing.planPrice as string | null) ?? null;
  const eyebrow = (category.name as string) ?? null;

  // narrow: 3-up beside the filter rail (the legacy listing layout)
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const memberPrice = memberPricingEnabled ? memberPriceMap[p.id as number] ?? null : null;
        return (
          <ProductPurchaseProvider
            key={p.id as number}
            product={cardPurchaseProduct(p)}
            memberPrice={memberPrice}
            isMember={isMember}
            membershipTeaser={planPrice ? { fromPrice: parseFloat(planPrice).toFixed(2) } : null}
          >
            <TemplateRenderer
              template={cardSource}
              data={{ product: cardData(p, { eyebrow, clearance: false }) }}
              ctx={ctx}
              seedKey={`partial/${cardKey}`}
              channelKey="chef-s-kitchen"
              resolvePartial={resolvePartial}
              draft={ctx?.draft ?? false}
            />
          </ProductPurchaseProvider>
        );
      })}
    </div>
  );
}

export function LoadMoreWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  const extras = categoryExtras(ctx);
  const listing = extras.listing;
  if (!extras.hasMore || !extras.nextPageHref || !listing) return null;
  const shown = listing.products?.length ?? 0;
  return (
    <div className="mt-10 text-center">
      <Link href={extras.nextPageHref} scroll={false} className="btn-secondary">
        Load more ({listing.total - shown} remaining)
      </Link>
    </div>
  );
}

// ── Product-tab widgets ──────────────────────────────────────────────────────

import { BrandWarranty } from "@/components/product/WarrantyDirectory";
import { ReviewsSection } from "@/components/product/ProductTabs";

export function BrandWarrantyWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  if (ctx?.record?.kind !== "product") return null;
  const extras = (ctx.record.extras ?? {}) as { brandRow?: { name?: string | null } | null };
  return <BrandWarranty brand={extras.brandRow?.name ?? null} />;
}

export function ReviewsPanelWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  if (ctx?.record?.kind !== "product") return null;
  const product = ctx.record.product as { id: number };
  const extras = (ctx.record.extras ?? {}) as { reviews?: unknown[] };
  return (
    <ReviewsSection
      reviews={(extras.reviews ?? []) as never}
      productId={product.id}
    />
  );
}
