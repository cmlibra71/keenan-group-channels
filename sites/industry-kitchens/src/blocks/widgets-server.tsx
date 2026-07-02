import "server-only";

// ============================================================================
// CMS v2 SERVER widgets — template/IK fork. product_grid/listing_grid render
// the shared product_card partial per product, each card wrapped in a
// lightweight ProductPurchaseProvider (locked price widget works per card).
// ============================================================================

import type { RenderContext } from "@keenan/services";
import {
  getProducts,
  getCategoryBySlug,
  getCategoryListing,
  getRelatedProducts,
  getFeatureFlag,
} from "@/lib/store";
import { getListingMemberPrices } from "@/lib/member";
import {
  ProductPurchaseProvider,
  type PurchaseProduct,
} from "@/components/product/ProductPurchaseProvider";
import { TemplateRenderer } from "./TemplateRenderer";
import { getPartialSource, buildPartialResolver, CHANNEL_KEY } from "./partials";
import imageLoader from "@/lib/image-loader";

type AnyRecord = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

function cardPurchaseProduct(p: AnyRecord): PurchaseProduct {
  return {
    id: p.id as number,
    name: (p.name as string) ?? "",
    sku: (p.sku as string) ?? null,
    price: (p.price as string) ?? "0",
    salePrice: (p.salePrice as string) ?? null,
    inventoryLevel: (p.inventoryLevel as number) ?? 0,
    inventoryTracking: (p.inventoryTracking as string) ?? "none",
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

const IMG_WIDTHS = [200, 400, 800] as const;
function imageFields(raw: string | null | undefined) {
  if (!raw) return { imageUrl: null, imageSrcset: null };
  return {
    imageUrl: imageLoader({ src: raw, width: 400, quality: 80 }),
    imageSrcset: IMG_WIDTHS.map(
      (w) => `${imageLoader({ src: raw, width: w, quality: 80 })} ${w}w`
    ).join(", "),
  };
}

function cardData(p: AnyRecord): AnyRecord {
  const raw =
    ((p.thumbnailImage as AnyRecord | null)?.urlThumbnail as string) ??
    ((p.thumbnailImage as AnyRecord | null)?.urlStandard as string) ??
    null;
  const rrp = parseFloat((p.price as string) ?? "0");
  return {
    id: p.id,
    name: p.name ?? "",
    sku: p.sku ?? "",
    slug: (p.urlPath as string) ?? String(p.id),
    price: Number.isFinite(rrp) ? rrp : null,
    salePrice: p.salePrice ? parseFloat(p.salePrice as string) : null,
    brandName: (p.brandName as string) ?? null,
    memberPrice: null,
    ...imageFields(raw),
  };
}

export async function CardPartialGrid({
  products,
  ctx,
  cardKey = "product_card",
  cardTemplate,
  memberPriceMap,
  memberPricingEnabled,
  gridClassName = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6",
}: {
  products: AnyRecord[];
  ctx?: RenderContext;
  cardKey?: string;
  cardTemplate?: string | null;
  memberPriceMap?: Record<number, number>;
  memberPricingEnabled?: boolean;
  gridClassName?: string;
}) {
  if (products.length === 0) return null;
  const [cardSource, resolvePartial, priceMap, mpe] = await Promise.all([
    cardTemplate ? Promise.resolve(cardTemplate) : getPartialSource(cardKey, ctx),
    buildPartialResolver(ctx),
    memberPriceMap !== undefined
      ? Promise.resolve(memberPriceMap)
      : (getListingMemberPrices(products as never).catch(() => ({})) as Promise<
          Record<number, number>
        >),
    memberPricingEnabled !== undefined
      ? Promise.resolve(memberPricingEnabled)
      : getFeatureFlag("member_pricing_enabled").catch(() => false),
  ]);
  if (!cardSource) return null;

  return (
    <div className={gridClassName}>
      {products.map((p) => (
        <ProductPurchaseProvider
          key={p.id as number}
          product={cardPurchaseProduct(p)}
          memberPrice={mpe ? priceMap[p.id as number] ?? null : null}
          isMember={false}
        >
          <TemplateRenderer
            template={cardSource}
            data={{ product: cardData(p) }}
            ctx={ctx}
            seedKey={`partial/${cardKey}`}
            channelKey={CHANNEL_KEY}
            resolvePartial={resolvePartial}
            draft={ctx?.draft ?? false}
          />
        </ProductPurchaseProvider>
      ))}
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
  const source = str(attrs.source) || "related";
  const limit = num(attrs.limit, 8);
  let products: AnyRecord[] = [];
  try {
    if (source === "related" && ctx?.record?.kind === "product") {
      const product = ctx.record.product as AnyRecord;
      const extras = (ctx.record.extras ?? {}) as AnyRecord;
      products = (
        (extras.relatedProducts as AnyRecord[]) ??
        ((await getRelatedProducts(
          product.id as number,
          (product.categoryIds as number[]) ?? []
        )) as AnyRecord[])
      ).slice(0, limit);
    } else if (source === "featured") {
      ({ products } = (await getProducts({ featured: true, limit })) as { products: AnyRecord[] });
    } else if (source === "onSale") {
      ({ products } = (await getProducts({ onSale: true, limit })) as { products: AnyRecord[] });
    } else if (source === "category" && str(attrs.category_slug)) {
      const cat = await getCategoryBySlug(str(attrs.category_slug));
      if (cat) ({ products } = (await getCategoryListing(cat.id, { limit })) as { products: AnyRecord[] });
    }
  } catch {
    products = [];
  }
  return (
    <CardPartialGrid
      products={products}
      ctx={ctx}
      cardKey={str(attrs.card) || "product_card"}
      cardTemplate={str(attrs.card_template) || null}
    />
  );
}

export async function ListingGridWidget({
  attrs,
  ctx,
}: {
  attrs: Record<string, unknown>;
  ctx?: RenderContext;
}) {
  if (ctx?.record?.kind !== "category") return null;
  const category = ctx.record.category as AnyRecord;
  const extras = (ctx.record.extras ?? {}) as {
    listing?: { products?: AnyRecord[] };
    memberPriceMap?: Record<number, number>;
    memberPricingEnabled?: boolean;
  };
  let products = extras.listing?.products;
  if (!products) {
    try {
      ({ products } = (await getCategoryListing(category.id as number, {
        page: 1,
        limit: 24,
      })) as { products: AnyRecord[] });
    } catch {
      return null;
    }
  }
  return (
    <CardPartialGrid
      products={products ?? []}
      ctx={ctx}
      cardKey={str(attrs.card) || "product_card"}
      cardTemplate={str(attrs.card_template) || null}
      memberPriceMap={extras.memberPriceMap}
      memberPricingEnabled={extras.memberPricingEnabled}
    />
  );
}

// ── Category widgets (URL-state components) ─────────────────────────────────

import { FilterChips, SortSelect } from "@/components/category/FilterRail";
import Link from "next/link";

export function FilterChipsWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  const extras =
    ctx?.record?.kind === "category" ? ((ctx.record.extras ?? {}) as { listing?: { facets?: unknown } }) : {};
  if (!extras.listing?.facets) return null;
  return <FilterChips facets={extras.listing.facets as never} />;
}

export function SortSelectWidget() {
  return <SortSelect />;
}

export function LoadMoreWidget({ ctx }: { attrs: Record<string, unknown>; ctx?: RenderContext }) {
  const extras =
    ctx?.record?.kind === "category"
      ? ((ctx.record.extras ?? {}) as {
          listing?: { products?: unknown[]; total?: number };
          hasMore?: boolean;
          nextPageHref?: string;
        })
      : {};
  if (!extras.hasMore || !extras.nextPageHref || !extras.listing) return null;
  const shown = extras.listing.products?.length ?? 0;
  const total = extras.listing.total ?? 0;
  return (
    <div className="mt-10 text-center">
      <Link
        href={extras.nextPageHref}
        scroll={false}
        className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-500"
      >
        Load more ({total - shown} remaining)
      </Link>
    </div>
  );
}
