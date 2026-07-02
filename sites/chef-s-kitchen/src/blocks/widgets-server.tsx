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
import {
  getProducts,
  getCategoryBySlug,
  getCategoryListing,
  getRelatedProducts,
  getFeatureFlag,
} from "@/lib/store";
import { getListingPricing } from "@/lib/member";
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

export async function ProductGridWidget({
  attrs,
  ctx,
}: {
  attrs: Record<string, unknown>;
  ctx?: RenderContext;
}) {
  const products = await fetchGridProducts(attrs, ctx);
  if (products.length === 0) return null;

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
