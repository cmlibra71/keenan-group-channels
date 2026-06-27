import { unstable_cache } from "next/cache";
import { initCommerceDb, createChannelStore } from "@keenan/services";
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
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  accountService,
  orderService,
  orderItemService,
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

// Auto-initialize DB connection on first import
const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (dbUrl) {
  initCommerceDb(dbUrl, { maxConnections: 5 });
}

const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || "1", 10);

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
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  accountService,
  customerAddressService,
  orderService,
  orderItemService,
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
