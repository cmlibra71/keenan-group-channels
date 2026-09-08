import { applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { attachBrandLogos } from "@/lib/brand-logo-fallback";
import { ProductGridClient } from "./ProductGridClient";

interface ProductWithImage {
  id: number;
  name: string;
  sku?: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  brandName?: string | null;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
  /**
   * Card tSrCcnvx: the brand's logo, drawn instead of the grey package box when
   * the product has no photo (or its file is broken). Attached below, never by
   * a caller — every listing card in the site funnels through here.
   */
  brand_logo_url?: string | null;
  /** The brand's NAME — the fallback image's ALT text. Attached with the URL. */
  brand_name?: string | null;
}

/**
 * Design-system product grid: 4-up ≥1024 / 3-up 768 / 2-up mobile (3-up max
 * when `narrow` — beside the category filter rail).
 */
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
  accountPricing,
  savingsPctMap,
  isMember,
  planPrice,
  eyebrow,
  clearance,
  narrow,
  listId,
  listName,
  wrapperClassName,
  renderEmpty = true,
  indexOffset = 0,
}: {
  products: ProductWithImage[];
  memberPricingAvailable?: boolean;
  /** Member prices keyed by product id (computed for guests too — join funnel). */
  memberPriceMap?: Record<number, number>;
  accountPricing?: boolean;
  savingsPctMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
  /** Category eyebrow shown on each card. */
  eyebrow?: string | null;
  clearance?: boolean;
  /** 3-up max — used beside the category filter rail. */
  narrow?: boolean;
  /** GA4 list identity for view_item_list / select_item (e.g. category slug + name). */
  listId?: string;
  listName?: string;
  /**
   * The grid wrapper's classes. `"contents"` makes this render a CONTINUATION
   * of a grid the caller already owns (the search feed appends chunk after
   * chunk into one grid); omitted, it starts its own.
   */
  wrapperClassName?: string;
  /** False for an appended chunk: "No products found." belongs to the page, once. */
  renderEmpty?: boolean;
  /** Position of the first tile in the whole list, for GA4 list indexes. */
  indexOffset?: number;
}) {
  // Hide before pricing. Rows arrive from the SHARED category_listing_cache / unstable_cache /
  // Meilisearch index, which cannot encode per-account visibility or price — both are applied HERE,
  // per viewer, to a copy. Guests still get the visibility pass (other accounts' exclusive products
  // are hidden from them too).
  products = await applyCatalogScope(products);
  products = await applyAccountPrices(products);
  // Card tSrCcnvx: the brand logo the tile falls back to when a product has no
  // photo, or when its photo's file turns out to be missing. Resolved for EVERY
  // row (not only the visibly imageless ones) because a broken file is only
  // discovered in the browser, where no further server read is available. One
  // primary-key lookup per grid, and a no-op on a channel that has not opted in.
  products = await attachBrandLogos(products);
  if (products.length === 0) {
    if (!renderEmpty) return null;
    return (
      <div className="py-16 text-center">
        <p className="text-text-muted">No products found.</p>
      </div>
    );
  }

  return (
    <ProductGridClient
      products={products}
      memberPricingAvailable={memberPricingAvailable}
      memberPriceMap={memberPriceMap}
      accountPricing={accountPricing}
      savingsPctMap={savingsPctMap}
      isMember={isMember}
      planPrice={planPrice}
      eyebrow={eyebrow}
      clearance={clearance}
      narrow={narrow}
      listId={listId}
      listName={listName}
      wrapperClassName={wrapperClassName}
      renderEmpty={renderEmpty}
      indexOffset={indexOffset}
    />
  );
}
