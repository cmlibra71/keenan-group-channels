import { ProductCard } from "./ProductCard";
import { TileCompare } from "./TileCompare";
import { TileBuyButtons } from "./TileBuyButtons";
import { tileBuyFacts } from "@/lib/tile-buy";
import { cardPrice } from "@/lib/card-price";
import { applyAccountPrices, getPricingGroupId } from "@/lib/member";
import { attachFromPrices } from "@/lib/store";
import { promotionBadgeMap } from "@/lib/promotions/badges";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { getBrandLogos } from "@/lib/brand-logo-fallback";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

interface ProductWithImage {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  /**
   * Card tJ4audbu — the PARTNER SPECIAL pricing this product, put on the row by the storefront's
   * price funnel (`lib/member.ts` `applyAccountPrices` → `applySpecialPrices`). Its `price` /
   * `salePrice` already carry the was/now; this is what puts Tim's badge on the tile. Absent =
   * no special.
   */
  special?: { badge: string; label: string | null } | null;
  fromPrice?: string | null;
  fromSalePrice?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
  sku?: string | null;
  brandName?: string | null;
  availability?: string | null;
  restrictAddToCart?: unknown;
  restrictAddToQuote?: unknown;
  purchasingDisabled?: unknown;
  /** services `attachTileFacts` (via `attachFromPrices` below): a required question on this channel. */
  answerRequired?: boolean;
  /** services `attachTileFacts`: Zoey's price suffix. */
  priceSuffix?: string | null;
  /** services `attachTileFacts`: Zoey product type when not simple (a grouped tile draws no buttons). */
  zoeyType?: string | null;
  /** services `attachFromPrices`: the configurable's choices differ in price ("Starting From:"). */
  fromPriceVaries?: boolean;
  /** services `attachTierLows` (via `attachFromPrices` below): the lowest quantity-break price. */
  tierLowPrice?: string | null;
}

/**
 * Server component. Every listing card in the site funnels through here, so this is where the
 * shopper's per-account contract prices are applied — at READ time, to the rows already fetched
 * from the SHARED sources (category_listing_cache, unstable_cache, the Meilisearch index), which
 * cannot hold a per-account price without leaking it to every other shopper. Guests: no-op.
 */
export async function ProductGrid({
  products,
  memberPricingAvailable,
  memberPriceMap,
  listId,
  listName,
  wrapperClassName = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6",
  renderEmpty = true,
  indexOffset = 0,
  showCompare = false,
  buyButtons,
  saleFlags = false,
  showSku = false,
}: {
  products: ProductWithImage[];
  memberPricingAvailable?: boolean;
  /** Active member's prices keyed by product id (from getMemberPriceMap). */
  memberPriceMap?: Record<number, number>;
  /** GA4 list identity for view_item_list / select_item (e.g. category slug + name). */
  listId?: string;
  listName?: string;
  /**
   * The grid wrapper's classes. `"contents"` makes this render a CONTINUATION
   * of a grid the caller already owns (the search feed appends chunk after
   * chunk into one grid); anything else starts its own.
   */
  wrapperClassName?: string;
  /** False for an appended chunk: "No products found." belongs to the page, once. */
  renderEmpty?: boolean;
  /** Position of the first tile in the whole list, for GA4 list indexes. */
  indexOffset?: number;
  /**
   * An "Add to Compare" link under each tile (IK parity, compare-feature) — the old site's
   * LISTING pages (category, brand, search, clearance) carried one; rails (home, related)
   * did not, so it is opt-in per call site.
   */
  showCompare?: boolean;
  /**
   * IK parity, product cards — the buy controls under each tile, as Zoey drew them on the
   * equivalent old page: "listing" for a category-style list (clearance), "search" for search
   * results. Omitted: no buttons (rails, /products), exactly as before. See `lib/tile-buy.ts`.
   */
  buyButtons?: "listing" | "search";
  /** Zoey's "SALE" flag on the photo (listing and search pages; not rails). */
  saleFlags?: boolean;
  /** The "SKU:" line (Zoey's search tile). */
  showSku?: boolean;
}) {
  // Hide before pricing. Rows arrive from the SHARED category_listing_cache / unstable_cache /
  // Meilisearch index, which cannot encode per-account visibility or price — both are applied HERE,
  // per viewer, to a copy. Guests still get the visibility pass (other accounts' exclusive products
  // are hidden from them too).
  products = await applyCatalogScope(products);
  products = await applyAccountPrices(products);
  // configurable-from-price: AFTER the overlays, so a configurable tile reads "Starting From".
  // …priced at the viewer's customer-group price list, the same record the tile's headline carries.
  products = await attachFromPrices(products, { pricingGroupId: await getPricingGroupId() });
  // The Buy X Get Y / free-freight badge each React tile carries (card EIXdjw2s) — the same map the
  // authored tiles read, for exactly the products still on the page after scope.
  const promoBadges = await promotionBadgeMap(
    products as unknown as { id: number; sku?: string | null }[]
  );
  if (products.length === 0) {
    if (!renderEmpty) return null;
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">No products found.</p>
      </div>
    );
  }

  // Card tSrCcnvx: the brand logo the tile falls back to when a product has no
  // photo, or when its photo's file turns out to be missing. Resolved for EVERY
  // row (not only the visibly imageless ones) because a broken file is only
  // discovered in the browser, where no further server read is available. One
  // primary-key lookup per grid.
  const brandLogos = await getBrandLogos(products.map((p) => p.id));

  // data-listing-grid: while a filter change loads, each card becomes a loader of
  // the same size (lib/listing-nav.tsx + globals.css).
  return (
    <div data-listing-grid="" className={wrapperClassName}>
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: String(p.id),
          item_name: p.name,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index: indexOffset + index,
        }))}
      />
      {products.map((product, index) => {
        const tile = (
          <ProductCard
            key={product.id}
            productId={product.id}
            name={product.name}
            slug={product.urlPath || String(product.id)}
            price={product.price}
            salePrice={product.salePrice}
            special={product.special ?? null}
            fromPrice={product.fromPrice ?? null}
            fromSalePrice={product.fromSalePrice ?? null}
            imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
            brandLogoUrl={brandLogos.get(product.id)?.brand_logo_url ?? null}
            brandLogoAlt={brandLogos.get(product.id)?.brand_name ?? null}
            memberPricingAvailable={memberPricingAvailable}
            memberPrice={memberPriceMap?.[product.id] ?? null}
            saleFlag={saleFlags}
            fromPriceVaries={buyButtons ? product.fromPriceVaries === true : undefined}
            // Zoey: a $0 tile says "POA" on a category-style list and nothing on search; a grouped
            // product's tile prints no price at all.
            zeroPriceText={buyButtons === "search" ? "" : buyButtons === "listing" ? "POA" : undefined}
            hidePrice={buyButtons != null && product.zoeyType === "grouped"}
            brandLine={buyButtons === "search" ? (product.brandName ?? null) : null}
            sku={product.sku ?? null}
            showSku={showSku}
            // Zoey's search tile prints no price suffix; its category tile does.
            priceSuffix={buyButtons === "search" ? null : (product.priceSuffix ?? null)}
            tierLowPrice={product.tierLowPrice ?? null}
            promotionBadge={promoBadges[product.id] ?? null}
            listId={listId}
            listName={listName}
            listIndex={indexOffset + index}
          />
        );
        const buy = buyButtons ? (
          <TileBuyButtons
            mode={buyButtons}
            facts={tileBuyFacts(product)}
            productId={product.id}
            href={`/products/${product.urlPath || product.id}`}
            name={product.name}
            sku={product.sku ?? null}
            price={(() => {
              const p = cardPrice(product);
              return (p.sale ?? p.list) || null;
            })()}
            brand={product.brandName ?? null}
          />
        ) : null;
        return showCompare || buy ? (
          <div key={product.id} className="flex flex-col">
            {tile}
            {buy}
            {showCompare && <TileCompare productId={product.id} />}
          </div>
        ) : (
          tile
        );
      })}
    </div>
  );
}
