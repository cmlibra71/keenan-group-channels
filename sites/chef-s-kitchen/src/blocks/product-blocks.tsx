// ============================================================================
// Product TEMPLATE blocks (page_kind 'product') — Chef's Depot fork.
//
// Faithful extraction of app/products/[slug]/page.tsx sections into
// RenderContext-driven system blocks. The buy area stays ONE block
// (product_buybox → ProductPageClient: two-column gallery + purchase panel —
// they share option-selection state; decomposing it is checkout-adjacent risk
// for zero editorial value). The live route precomputes the heavy data into
// ctx.record.extras; on the portal render surface each block self-fetches.
// Keep the JSX in exact sync with the legacy page until that path is deleted.
// ============================================================================
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RenderContext } from "@keenan/services";
import {
  getProductReviews,
  getProductAttachments,
  getRelatedProducts,
  getFeatureFlag,
  getEffectivePrice,
  brandService,
  CHANNEL_ID,
  getProductBreadcrumbs,
  shouldSuppressCatalogSalePrice,
  getCmsPage,
} from "@/lib/store";
import { getMemberContext, getListingPricing } from "@/lib/member";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BackButton } from "@/components/ui/BackButton";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

type BlockProps = { props: Record<string, unknown>; ctx?: RenderContext };

// The channel-scoped product shape getProductBySlug returns (camelCase model).
// Loosely typed on purpose — blocks pass fields through to the same components
// the legacy page used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductRecord = any;

export type Crumb = { id: number; name: string; slug: string };

/** Precomputed by the live product route; absent on the render surface. */
export type ProductExtras = {
  reviews?: unknown[];
  reviewSummary?: { avg: number; count: number } | null;
  attachments?: unknown[];
  relatedProducts?: unknown[];
  relatedPricing?: Record<string, unknown>;
  brandRow?: { name?: string | null; slug?: string | null } | null;
  breadcrumbs?: Crumb[];
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  memberPricingEnabled?: boolean;
  suppressCatalogPricing?: boolean;
};

function productOf(ctx?: RenderContext): ProductRecord | null {
  if (ctx?.record?.kind !== "product") return null;
  return ctx.record.product as ProductRecord;
}

function extrasOf(ctx?: RenderContext): ProductExtras {
  return (ctx?.record?.kind === "product" ? (ctx.record.extras as ProductExtras) : undefined) ?? {};
}

const CONTAINER = "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8";

async function crumbsFor(product: ProductRecord, extras: ProductExtras): Promise<Crumb[]> {
  if (extras.breadcrumbs) return extras.breadcrumbs;
  try {
    return (await getProductBreadcrumbs(product.id)) as Crumb[];
  } catch {
    return [];
  }
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────────

async function BreadcrumbsBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const breadcrumbs = await crumbsFor(product, extrasOf(ctx));
  return (
    <div className={`${CONTAINER} pt-8`}>
      {breadcrumbs.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted mb-6">
          <Link href="/products" className="hover:text-text-secondary transition-colors duration-300">Products</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-text-secondary transition-colors duration-300">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-body truncate max-w-[200px]">{product.name}</span>
        </nav>
      ) : (
        <BackButton fallbackHref="/products" fallbackLabel="Back to Products" className="mb-6" />
      )}
    </div>
  );
}

// ── Product overview (gallery + buy box — ONE client component) ─────────────

async function ProductBuyboxBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);

  let {
    memberPrice = null,
    memberPriceMap,
    isMember,
    membershipTeaser = null,
    suppressCatalogPricing,
    reviewSummary,
    brandRow,
  } = extras;

  // Render-surface fallback — guest-visitor computation mirroring the route.
  if (memberPriceMap === undefined) {
    memberPriceMap = {};
    const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
    const memberCtx = await getMemberContext();
    isMember = memberCtx.isMember;
    if (memberPricingEnabled && memberCtx.customerGroupId) {
      membershipTeaser = {
        fromPrice: memberCtx.planPrice ? parseFloat(memberCtx.planPrice).toFixed(2) : null,
      };
      const variants = product.variants ?? [];
      const pricingResults = await Promise.all(
        variants.map((v: { id: number }) =>
          getEffectivePrice(v.id, CHANNEL_ID, memberCtx.customerGroupId)
        )
      );
      for (let i = 0; i < variants.length; i++) {
        if (pricingResults[i].salePrice) {
          memberPriceMap[variants[i].id] = parseFloat(pricingResults[i].salePrice as string);
        }
      }
      const defaultVariant = variants[0];
      if (defaultVariant && memberPriceMap[defaultVariant.id] != null) {
        memberPrice = memberPriceMap[defaultVariant.id];
      }
    }
  }
  if (suppressCatalogPricing === undefined) {
    suppressCatalogPricing = await shouldSuppressCatalogSalePrice();
  }
  if (reviewSummary === undefined) {
    const reviews = (await getProductReviews(product.id).catch(() => [])) as { rating: number }[];
    reviewSummary =
      reviews.length > 0
        ? { avg: reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length, count: reviews.length }
        : null;
  }
  if (brandRow === undefined) {
    brandRow =
      product.brandId != null
        ? ((await brandService.getById(product.brandId).catch(() => null)) as {
            name?: string | null;
            slug?: string | null;
          } | null)
        : null;
  }

  return (
    <div className={CONTAINER}>
      <ProductPageClient
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          salePrice: product.salePrice,
          inventoryLevel: product.inventoryLevel ?? 0,
          inventoryTracking: product.inventoryTracking ?? "none",
          availability: product.availability ?? "available",
          descriptionShort: product.descriptionShort,
          images: product.images,
          variants: product.variants,
          options: product.options ?? [],
          optionValues: product.optionValues ?? [],
          variantOptionMappings: product.variantOptionMappings ?? [],
          bulkPricing: suppressCatalogPricing ? [] : (product.bulkPricing ?? []),
        }}
        memberPrice={memberPrice}
        memberPriceMap={memberPriceMap}
        isMember={isMember ?? false}
        membershipTeaser={membershipTeaser}
        brandName={brandRow?.name ?? null}
        reviewSummary={reviewSummary ?? null}
      />
    </div>
  );
}

// ── Brand / category cross-links ─────────────────────────────────────────────

async function ProductLinksBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);
  const [breadcrumbs, brandRow] = await Promise.all([
    crumbsFor(product, extras),
    extras.brandRow !== undefined
      ? Promise.resolve(extras.brandRow)
      : product.brandId != null
        ? (brandService.getById(product.brandId).catch(() => null) as Promise<{
            name?: string | null;
            slug?: string | null;
          } | null>)
        : Promise.resolve(null),
  ]);
  if (!brandRow?.name && breadcrumbs.length === 0) return null;
  return (
    <div className={CONTAINER}>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        {brandRow?.name && brandRow?.slug && (
          <Link href={`/brands/${brandRow.slug}`} className="btn-ghost text-[13px]">
            See all {brandRow.name} products →
          </Link>
        )}
        {breadcrumbs.length > 0 && (
          <Link
            href={`/categories/${breadcrumbs[breadcrumbs.length - 1].slug}`}
            className="btn-ghost text-[13px]"
          >
            More {breadcrumbs[breadcrumbs.length - 1].name} →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Tabs (description / specs / reviews / attachments) ──────────────────────

async function ProductTabsBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);
  const [reviews, attachments, brandRow] = await Promise.all([
    extras.reviews ?? getProductReviews(product.id).catch(() => []),
    extras.attachments ?? getProductAttachments(product.id).catch(() => []),
    extras.brandRow !== undefined
      ? Promise.resolve(extras.brandRow)
      : product.brandId != null
        ? (brandService.getById(product.brandId).catch(() => null) as Promise<{
            name?: string | null;
          } | null>)
        : Promise.resolve(null),
  ]);
  return (
    <div className={CONTAINER}>
      <ProductTabs
        description={product.description}
        warranty={product.warranty ?? null}
        brandName={brandRow?.name ?? null}
        customFields={product.customFields as Record<string, unknown> | null}
        reviews={reviews as never}
        attachments={attachments as never}
        productId={product.id}
      />
    </div>
  );
}

// ── Related products ─────────────────────────────────────────────────────────

async function ProductRelatedBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);
  const relatedProducts =
    extras.relatedProducts ??
    (await getRelatedProducts(product.id, product.categoryIds ?? []).catch(() => []));
  if (!relatedProducts.length) return null;
  const [relatedPricing, memberPricingEnabled] = await Promise.all([
    extras.relatedPricing !== undefined
      ? Promise.resolve(extras.relatedPricing)
      : (getListingPricing(relatedProducts as never) as Promise<unknown>).then(
          (p) => p as Record<string, unknown>
        ),
    extras.memberPricingEnabled !== undefined
      ? Promise.resolve(extras.memberPricingEnabled)
      : getFeatureFlag("member_pricing_enabled"),
  ]);
  return (
    <div className={`${CONTAINER} pb-8`}>
      <div className="mt-12 border-t border-border pt-8">
        <h2 className="section-title mb-6">You may also like</h2>
        <ProductGrid
          products={relatedProducts as never}
          memberPricingAvailable={memberPricingEnabled}
          {...(relatedPricing as object)}
        />
      </div>
    </div>
  );
}

// ── Channel-wide __product__ content slot (above/below detail) ──────────────

async function ProductSlotBlock({ props, ctx }: BlockProps) {
  const slotRegion = typeof props.slot_region === "string" ? props.slot_region : "above_detail";
  const doc = await getCmsPage("__product__", ctx?.draft ?? false).catch(() => null);
  const blocks = ((doc?.blocks as unknown as RenderedBlock[]) ?? []).filter(
    (b) => b.region === slotRegion
  );
  if (blocks.length === 0) return null;
  return (
    <div className={CONTAINER}>
      <BlockRenderer blocks={blocks} draft={ctx?.draft ?? false} />
    </div>
  );
}

export const PRODUCT_BLOCK_COMPONENTS = {
  breadcrumbs: BreadcrumbsBlock,
  product_buybox: ProductBuyboxBlock,
  product_links: ProductLinksBlock,
  product_tabs: ProductTabsBlock,
  product_related: ProductRelatedBlock,
  product_slot: ProductSlotBlock,
};
