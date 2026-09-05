// ============================================================================
// Product pictures for the checkout Order Summary — the impure half (one
// batched read). Card qjV98YEK.
//
// Same never-throw discipline as `brandIdsForProducts` and
// `backorderFactsForProducts`: checkout is the critical path, and a picture is
// the most disposable thing on it. A failure here degrades to a summary with no
// photographs, never to a checkout that will not render.
//
// The "primary image" rule is NOT re-invented here. `primaryImageUrlsForProducts`
// in @keenan/services is the same precedence the listing tiles, the Google feed
// and the transactional emails use (flagged thumbnail -> lowest sort_order ->
// lowest id, `url_thumbnail` falling back to `url_standard`), so the picture in
// the Order Summary is the one the shopper already saw on the tile they clicked.
// ============================================================================

import { isFetchableImageUrl } from "@/lib/image-origin";

/** Read the primary photograph per product id. Injected so the policy above it is testable. */
export type PrimaryImageReader = (productIds: number[]) => Promise<Map<number, string>>;

/**
 * The real read. `@/lib/store` is pulled in LAZILY — a static import would drag the
 * whole service barrel (and its DB connection) into anything that merely imports this
 * module, including its own unit test.
 */
const readPrimaryImages: PrimaryImageReader = async (productIds) => {
  const { productImageService } = await import("@/lib/store");
  return productImageService.primaryImageUrlsForProducts(productIds);
};

/**
 * Drop any URL `/api/image` would refuse to fetch.
 *
 * Every product photograph in production sits in one of our own S3 buckets, so
 * nothing is dropped today; the filter is here so a row pointing somewhere else
 * renders the placeholder rather than a broken picture (the transform route
 * answers 403, and an <Image> pointed at a 403 draws a blank box next to a
 * priced line).
 */
export function usableImageUrls(
  raw: Map<number, string>,
  fetchable: (url: string) => boolean = isFetchableImageUrl
): Map<number, string> {
  const out = new Map<number, string>();
  for (const [productId, url] of raw) {
    if (url && fetchable(url)) out.set(productId, url);
  }
  return out;
}

/**
 * The primary photograph per product, batched, for the lines of one cart.
 * A product with no usable picture is simply absent from the map.
 */
export async function orderSummaryImagesForProducts(
  productIds: number[],
  read: PrimaryImageReader = readPrimaryImages,
  fetchable: (url: string) => boolean = isFetchableImageUrl
): Promise<Map<number, string>> {
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();
  try {
    return usableImageUrls(await read(ids), fetchable);
  } catch (e) {
    console.error("[checkout] order-summary image lookup failed (non-fatal):", e);
    return new Map();
  }
}
