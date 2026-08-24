// ============================================================================
// Product TEMPLATE blocks (page_kind 'product') — IK/template fork.
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
  getProductVideos,
  getRelatedProducts,
  getFeatureFlag,
  getEffectivePrice,
  getActiveSubscriptionForContact,
  getSubscriptionPlans,
  contactService,
  brandService,
  CHANNEL_ID,
  getProductBreadcrumbs,
  getCmsPage,
} from "@/lib/store";
import { getSession } from "@/lib/auth";
import { getAccountId } from "@/lib/member";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrandWarrantyNotes } from "@/components/product/BrandWarrantyNotes";
import { BackButton } from "@/components/ui/BackButton";
import { BlockRenderer, SubBlockRenderer, effectiveSubBlocks, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BLOCK_REGISTRY } from "@keenan/services";
import { ProductPurchaseProvider, type PurchaseProduct } from "@/components/product/ProductPurchaseProvider";
import type { FacadeVideo } from "@keenan/services/product-page";
import { buildBindingData } from "@/blocks/binding-data";
import { buildConditionContext } from "@/lib/condition-context";
import { buildPartialResolver, CHANNEL_KEY } from "@/blocks/partials";
import { CardPartialGrid } from "@/blocks/widgets-server";

type BlockProps = { props: Record<string, unknown>; ctx?: RenderContext };

// The channel-scoped product shape getProductBySlug returns (camelCase model).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductRecord = any;

export type Crumb = { id: number; name: string; slug: string };

type ProductBrandMetafields = {
  intro_html?: string;
  warranty_text?: string;
  extended_warranty?: { name: string; body: string; link?: string };
  installation_notes?: string[];
};

/** Precomputed by the live product route; absent on the render surface. */
export type ProductExtras = {
  reviews?: unknown[];
  attachments?: unknown[];
  videos?: FacadeVideo[];
  relatedProducts?: unknown[];
  brandMeta?: ProductBrandMetafields;
  breadcrumbs?: Crumb[];
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  memberPricingEnabled?: boolean;
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
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
          <Link href="/products" className="hover:text-zinc-600">Products</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-zinc-700 truncate max-w-[200px]">{product.name}</span>
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

  // Analytics enrichment (GA4/Klaviyo add_to_cart): brand + leaf category.
  const [buyboxCrumbs, buyboxBrandRow] = await Promise.all([
    crumbsFor(product, extras),
    product.brandId != null
      ? ((brandService.getById(product.brandId).catch(() => null)) as Promise<{ name: string | null } | null>)
      : Promise.resolve(null),
  ]);

  let {
    memberPrice = null,
    memberPriceMap,
    isMember = false,
    membershipTeaser = null,
  } = extras;

  // Render-surface fallback — mirrors the route's member-pricing derivation.
  if (memberPriceMap === undefined) {
    memberPriceMap = {};
    const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
    if (memberPricingEnabled) {
      const session = await getSession().catch(() => null);
      let customerGroupId: number | null = null;
      if (session) {
        const activeSub = await getActiveSubscriptionForContact(session.contactId).catch(() => null);
        if (activeSub) {
          const customer = (await contactService.getById(session.contactId).catch(() => null)) as {
            customer_group_id: number | null;
          } | null;
          customerGroupId = customer?.customer_group_id ?? null;
          isMember = true;
        }
      }
      if (!isMember) {
        const plans = (await getSubscriptionPlans().catch(() => [])) as { price: string | null }[];
        const cheapest = plans
          .map((p) => (p.price != null ? parseFloat(p.price) : NaN))
          .filter((p) => Number.isFinite(p))
          .sort((a, b) => a - b)[0];
        membershipTeaser = {
          fromPrice: cheapest != null && Number.isFinite(cheapest) ? cheapest.toFixed(2) : null,
        };
      }
      const accountId = await getAccountId();
      if (customerGroupId || accountId) {
        const variants = product.variants ?? [];
        const pricingResults = await Promise.all(
          variants.map((v: { id: number }) =>
            getEffectivePrice(v.id, CHANNEL_ID, customerGroupId, 1, accountId)
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
          // Per-product buying controls (card 7vu2iEEZ). Unset reads as today's behaviour.
          backorderPolicy: product.backorderPolicy ?? null,
          restrictAddToQuote: product.restrictAddToQuote === true,
          restrictAddToCart: product.restrictAddToCart === true,
          hidePrice: product.hidePrice === true,
          availability: product.availability ?? "available",
          descriptionShort: product.descriptionShort,
          images: product.images,
          variants: product.variants,
          options: product.options ?? [],
          optionValues: product.optionValues ?? [],
          variantOptionMappings: product.variantOptionMappings ?? [],
          bulkPricing: product.bulkPricing ?? [],
        }}
        memberPrice={memberPrice}
        memberPriceMap={memberPriceMap}
        isMember={isMember}
        membershipTeaser={membershipTeaser}
      />
    </div>
  );
}

// ── Brand warranty / installation notes ──────────────────────────────────────

async function ProductWarrantyNotesBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);
  let brandMeta = extras.brandMeta;
  if (brandMeta === undefined) {
    const brandRow =
      product.brandId != null
        ? ((await brandService.getById(product.brandId).catch(() => null)) as {
            metafields: ProductBrandMetafields | null;
          } | null)
        : null;
    brandMeta = (brandRow?.metafields ?? {}) as ProductBrandMetafields;
  }
  return (
    <div className={CONTAINER}>
      <BrandWarrantyNotes
        warranty_text={brandMeta.warranty_text}
        extended_warranty={brandMeta.extended_warranty}
        installation_notes={brandMeta.installation_notes}
      />
    </div>
  );
}

// ── Tabs (description / specs / reviews / attachments) ──────────────────────

async function ProductTabsBlock({ ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);
  const [reviews, attachments] = await Promise.all([
    extras.reviews ?? getProductReviews(product.id).catch(() => []),
    extras.attachments ?? getProductAttachments(product.id).catch(() => []),
  ]);
  return (
    <div className={CONTAINER}>
      <ProductTabs
        description={product.description}
        warranty={product.warranty ?? null}
        customFields={product.customFields as Record<string, unknown> | null}
        reviews={reviews as never}
        attachments={attachments as never}
        productId={product.id}
      />
    </div>
  );
}

// ── Related products ─────────────────────────────────────────────────────────

async function ProductRelatedBlock({ props, ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);

  const storedSubBlocks = props.subBlocks;
  const useV2 =
    process.env.CMS_V2_DISABLED !== "1" &&
    ((Array.isArray(storedSubBlocks) && storedSubBlocks.length > 0) ||
      ctx?.draft === true ||
      process.env.CMS_V2_FORCE === "1");
  if (useV2) {
    const def = BLOCK_REGISTRY.product_related;
    const [data, condCtx, resolvePartial] = await Promise.all([
      Promise.resolve(buildBindingData(ctx)),
      buildConditionContext(ctx),
      buildPartialResolver(ctx),
    ]);
    return (
      <div className={`${CONTAINER} pb-8`}>
        <SubBlockRenderer
          props={props}
          schema={def?.subBlockSchema}
          defaultLayout={def?.defaultProps?.layout as Record<string, unknown> | undefined}
          channelKey={CHANNEL_KEY}
          data={data}
          ctx={ctx}
          condCtx={condCtx}
          draft={ctx?.draft ?? false}
          editHooks={ctx?.draft ?? false}
          resolvePartial={resolvePartial}
        />
      </div>
    );
  }
  const relatedProducts =
    extras.relatedProducts ??
    (await getRelatedProducts(product.id, product.categoryIds ?? []).catch(() => []));
  if (!relatedProducts.length) return null;
  const memberPricingEnabled =
    extras.memberPricingEnabled !== undefined
      ? extras.memberPricingEnabled
      : await getFeatureFlag("member_pricing_enabled");
  return (
    <div className={`${CONTAINER} pb-8`}>
      <div className="mt-12 border-t border-zinc-200 pt-8">
        <h2 className="text-2xl font-bold text-zinc-900 mb-6">Related Products</h2>
        <ProductGrid products={relatedProducts as never} memberPricingAvailable={memberPricingEnabled} listId="related_products" listName="Related Products" />
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

// ── CMS v2.1: decomposed product overview (gallery/title/description/panel) ─

async function ProductOverviewBlock({ props, ctx }: BlockProps) {
  const product = productOf(ctx);
  if (!product) return null;
  const extras = extrasOf(ctx);

  const purchaseProduct: PurchaseProduct = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price,
    salePrice: product.salePrice,
    inventoryLevel: product.inventoryLevel ?? 0,
    inventoryTracking: product.inventoryTracking ?? "none",
    // Per-product buying controls (card 7vu2iEEZ). Unset reads as today's behaviour.
    backorderPolicy: product.backorderPolicy ?? null,
    restrictAddToQuote: product.restrictAddToQuote === true,
    restrictAddToCart: product.restrictAddToCart === true,
    hidePrice: product.hidePrice === true,
    availability: product.availability ?? "available",
    descriptionShort: product.descriptionShort,
    images: product.images,
    videos: extras.videos ?? (await getProductVideos(product.id).catch(() => [])),
    variants: product.variants,
    options: product.options ?? [],
    optionValues: product.optionValues ?? [],
    variantOptionMappings: product.variantOptionMappings ?? [],
    bulkPricing: product.bulkPricing ?? [],
  };

  const def = BLOCK_REGISTRY.product_overview;
  const [data, condCtx, resolvePartial] = await Promise.all([
    Promise.resolve(buildBindingData(ctx)),
    buildConditionContext(ctx),
    buildPartialResolver(ctx),
  ]);

  return (
    <div className={CONTAINER}>
      <ProductPurchaseProvider
        product={purchaseProduct}
        memberPrice={extras.memberPrice ?? null}
        memberPriceMap={extras.memberPriceMap ?? {}}
        isMember={extras.isMember ?? false}
        membershipTeaser={extras.membershipTeaser ?? null}
      >
        <SubBlockRenderer
          props={props}
          schema={def?.subBlockSchema}
          defaultLayout={def?.defaultProps?.layout as Record<string, unknown> | undefined}
          channelKey={CHANNEL_KEY}
          data={data}
          ctx={ctx}
          condCtx={condCtx}
          draft={ctx?.draft ?? false}
          editHooks={ctx?.draft ?? false}
          resolvePartial={resolvePartial}
        />
      </ProductPurchaseProvider>
    </div>
  );
}

export const PRODUCT_BLOCK_COMPONENTS = {
  product_overview: ProductOverviewBlock,
  breadcrumbs: BreadcrumbsBlock,
  product_buybox: ProductBuyboxBlock,
  product_warranty_notes: ProductWarrantyNotesBlock,
  product_tabs: ProductTabsBlock,
  product_related: ProductRelatedBlock,
  product_slot: ProductSlotBlock,
};
