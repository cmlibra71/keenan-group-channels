import { unstable_cache } from "next/cache";
import { initCommerceDb, createChannelStore, getCommerceClient } from "@keenan/services";
import {
  channelService,
  siteService,
  channelSettingsService,
  storeSettingsService,
  paymentService,
  brandService,
  categoryService,
  categoryTreeService,
  cartService,
  cartItemService,
  quoteService,
  quoteItemService,
  reviewService,
  couponService,
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  customerAuthTokenService,
  accountService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  subscriptionPlanService,
  subscriptionService,
  subscriptionEventService,
  drawTypeService,
  drawService,
  drawEntryService,
  prizeService,
  drawWinnerService,
  partnerOfferService,
  partnerDiscountCodeService,
  customerAddressService,
  productChannelAssignmentService,
  getEffectivePrice,
  getEffectivePrices,
  getEffectivePricesForProducts,
  shippingRateCardService,
  wantsStripeTestMode,
} from "@keenan/services";
import { googlePlacesService } from "@keenan/services/integrations";
import { CHANNEL_ID } from "./channel";

// Auto-initialize DB connection on first import
const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (dbUrl) {
  initCommerceDb(dbUrl, { maxConnections: 5 });
}

// ============================================================================
// Shared channel-store factory — all channel-scoped, cache-wrapped accessors
// live in @keenan/services. Caching (Next's unstable_cache) is injected here.
// CD passes no topCategories args (uses listTopLevelSlim defaults) and uses
// category-only related products (no curated upsells).
// ============================================================================

const _store = createChannelStore(CHANNEL_ID, unstable_cache, {
  useCuratedUpsells: false,
});

export const {
  getSiteConfig,
  shouldSuppressCatalogSalePrice,
  sanitizeCatalogProduct,
  sanitizeCatalogProducts,
  getProducts,
  getProductBySlug,
  getTopCategories,
  getCategories,
  getMegaMenu,
  getCategoryListing,
  getCategoryBySlug,
  getSubcategories,
  getCategoryStats,
  getCategoryBreadcrumbs,
  getProductBreadcrumbs,
  getCategoryById,
  getBrandsForChannel,
  getBrandBySlug,
  getProductReviews,
  getProductAttachments,
  getRelatedProducts,
  getSubscriptionPlans,
  getActiveSubscription,
  getMemberPriceMap,
  getUpcomingDraws,
  getPartnerOffers,
  getFeatureFlag,
  getContentPages,
  getContentPage,
  getCmsPage,
  getCmsCategoryPage,
  getCmsTemplate,
  getDesignTokens,
  getDraftDesignTokens,
  getCheckoutSettings,
  calculateShipping,
} = _store;

export type { MegaMenuNode, MegaMenuFeatured, ContentPage } from "@keenan/services";

// ============================================================================
// Channel settings (raw + typed accessors)
// ============================================================================

export const getChannelSetting = async (key: string): Promise<unknown> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value;
  } catch {
    return null;
  }
};

// CMS-editable footer content (the `footer` channel setting). Empty object →
// the Footer component falls back to DEFAULT_FOOTER (current content).
export const getFooterConfig = unstable_cache(
  async () => ((await getChannelSetting("footer")) as Record<string, unknown>) ?? {},
  [`footer-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

// Portal-managed header quick links (Storefront > Navigation writes this key).
// Empty (CD's default) → the header renders no quick-links strip.
export type HeaderNavItem = { label: string; href: string };

export const getHeaderNav = unstable_cache(
  async () => ((await getChannelSetting("header_nav")) as HeaderNavItem[] | null) ?? [],
  [`header-nav-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** True when Stripe should run in TEST mode for this channel: the portal "Payments
 * test mode" toggle (`payments_test_mode`) OR a non-production NODE_ENV. Delegates to
 * the canonical @keenan/services helper — the single source of truth for every
 * test-vs-live Stripe selection (gateway keys, publishable key, price id). */
export const wantStripeTestMode = (): Promise<boolean> => wantsStripeTestMode(CHANNEL_ID);

// Channel-scoped JSON setting reader (CD-local copy; mirrors the factory's
// internal helper). Kept for direct use by CD-specific accessors.
export const getJsonSetting = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return (setting.setting_value as T) ?? fallback;
  } catch {
    return fallback;
  }
};

// ============================================================================
// Sitemap (slim, paged catalog queries)
//
// The XML sitemap can list tens of thousands of product URLs (CD ≈ 38k), so it
// must NOT go through productService.listForChannel (which joins images, brands
// and resolves pricing). These read only url_path + updated_at for the channel's
// visible products, paged so each sitemap chunk stays well under the 50k limit.
// ============================================================================

// Raw postgres.js (not Drizzle) to avoid the dual drizzle-orm copy bundled in
// @keenan/services — its tables are typed against a nested drizzle install that
// is structurally incompatible with the root one's query builders.

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function getSitemapProducts(
  offset: number,
  limit: number
): Promise<Array<{ slug: string; updatedAt: Date | null }>> {
  const sql = getCommerceClient();
  if (!sql) return [];
  const rows = await sql<{ id: number; url_path: string | null; updated_at: string | Date | null }[]>`
    SELECT p.id, p.url_path, p.updated_at
    FROM product_channel_assignments a
    JOIN products p ON p.id = a.product_id
    WHERE a.channel_id = ${CHANNEL_ID} AND a.is_visible = true AND p.is_visible = true
    ORDER BY p.id
    LIMIT ${limit} OFFSET ${offset}`;
  // Product routes are keyed by url_path, falling back to the numeric id
  // (mirrors ProductGrid: `slug={product.urlPath || String(product.id)}`).
  return rows.map((r) => ({
    slug: r.url_path || String(r.id),
    // postgres.js returns timestamptz as a string here; coerce to Date so Next
    // serialises a valid W3C <lastmod>. Drop unparseable values.
    updatedAt: r.updated_at ? toDate(r.updated_at) : null,
  }));
}

// ============================================================================
// Re-export services for direct access
// ============================================================================

export {
  channelService,
  siteService,
  channelSettingsService,
  storeSettingsService,
  paymentService,
  brandService,
  categoryService,
  categoryTreeService,
  cartService,
  cartItemService,
  quoteService,
  quoteItemService,
  reviewService,
  couponService,
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  customerAuthTokenService,
  accountService,
  customerAddressService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  subscriptionPlanService,
  subscriptionService,
  subscriptionEventService,
  drawTypeService,
  drawService,
  drawEntryService,
  prizeService,
  drawWinnerService,
  partnerOfferService,
  partnerDiscountCodeService,
  googlePlacesService,
  productChannelAssignmentService,
  getEffectivePrice,
  getEffectivePrices,
  getEffectivePricesForProducts,
  shippingRateCardService,
  CHANNEL_ID,
};
