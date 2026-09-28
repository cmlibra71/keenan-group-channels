import { ProductCard } from "./ProductCard";
import { TileCompare } from "./TileCompare";
import { applyAccountPrices } from "@/lib/member";
import { attachFromPrices } from "@/lib/store";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { getBrandLogos } from "@/lib/brand-logo-fallback";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

interface ProductWithImage {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  fromPrice?: string | null;
  fromSalePrice?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
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
}) {
  // Hide before pricing. Rows arrive from the SHARED category_listing_cache / unstable_cache /
  // Meilisearch index, which cannot encode per-account visibility or price — both are applied HERE,
  // per viewer, to a copy. Guests still get the visibility pass (other accounts' exclusive products
  // are hidden from them too).
  products = await applyCatalogScope(products);
  products = await applyAccountPrices(products);
  // configurable-from-price: AFTER the overlays, so a configurable tile reads "Starting From".
  products = await attachFromPrices(products);
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

  return (
    <div className={wrapperClassName}>
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
            fromPrice={product.fromPrice ?? null}
            fromSalePrice={product.fromSalePrice ?? null}
            imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
            brandLogoUrl={brandLogos.get(product.id)?.brand_logo_url ?? null}
            brandLogoAlt={brandLogos.get(product.id)?.brand_name ?? null}
            memberPricingAvailable={memberPricingAvailable}
            memberPrice={memberPriceMap?.[product.id] ?? null}
            listId={listId}
            listName={listName}
            listIndex={indexOffset + index}
          />
        );
        return showCompare ? (
          <div key={product.id}>
            {tile}
            <TileCompare productId={product.id} />
          </div>
        ) : (
          tile
        );
      })}
    </div>
  );
}
