import { unstable_cache } from "next/cache";
import { initCommerceDb } from "@keenan/services";
import {
  channelService,
  siteService,
  channelSettingsService,
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
  customerService,
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
  checkoutSettingsHelper,
  productChannelAssignmentService,
  getEffectivePrice,
} from "@keenan/services";
import { googlePlacesService } from "@keenan/services/integrations";
import type { Channel, Site } from "@keenan/services";

// Auto-initialize DB connection on first import
const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (dbUrl) {
  initCommerceDb(dbUrl, { maxConnections: 5 });
}

const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || "1", 10);

// ============================================================================
// Site Config
// ============================================================================

export const getSiteConfig = unstable_cache(
  async (): Promise<{ channel: Channel | null; site: Site | null }> => {
    try {
      const channel = await channelService.getById(CHANNEL_ID) as Channel;
      const site = await siteService.getPrimaryForChannel(CHANNEL_ID) as Site | null;
      return { channel, site };
    } catch {
      return { channel: null, site: null };
    }
  },
  [`site-config-${CHANNEL_ID}`],
  { revalidate: 3600, tags: [`channel-${CHANNEL_ID}`, "site-config"] }
);

// ============================================================================
// Products (channel-scoped)
// ============================================================================

export const getProducts = (options?: {
  page?: number;
  limit?: number;
  categoryId?: number;
  featured?: boolean;
  onSale?: boolean;
  search?: string;
}) => {
  const key = `products-${CHANNEL_ID}-${JSON.stringify(options || {})}`;
  return unstable_cache(
    async () => productService.listForChannel(CHANNEL_ID, options),
    [key],
    { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "products"] }
  )();
};

export const getProductBySlug = (slug: string) => unstable_cache(
  async () => productService.getBySlug(slug, CHANNEL_ID),
  [`product-slug-${CHANNEL_ID}-${slug}`],
  { revalidate: 120, tags: [`channel-${CHANNEL_ID}`, "products"] }
)();

// ============================================================================
// Categories
// ============================================================================

export const getTopCategories = unstable_cache(
  async () => categoryService.listTopLevelSlim(CHANNEL_ID),
  [`top-categories-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getCategories = async () => categoryService.listVisibleSlim(CHANNEL_ID);

export const getCategoryBySlug = (slug: string) => unstable_cache(
  async () => categoryService.getBySlug(slug, CHANNEL_ID),
  [`category-slug-${CHANNEL_ID}-${slug}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getSubcategories = (parentId: number) => unstable_cache(
  async () => categoryService.listActiveChildrenSlim(parentId),
  [`subcategories-${CHANNEL_ID}-${parentId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryStats = (categoryId: number) => unstable_cache(
  async () => categoryService.getCategoryStats(categoryId),
  [`category-stats-${CHANNEL_ID}-${categoryId}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryBreadcrumbs = (pathIds: number[]) => unstable_cache(
  async () => categoryService.getBreadcrumbs(pathIds),
  [`category-breadcrumbs-${CHANNEL_ID}-${pathIds.join(",")}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryById = (categoryId: number) => unstable_cache(
  async () => categoryService.getById(categoryId),
  [`category-by-id-${CHANNEL_ID}-${categoryId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

// ============================================================================
// Reviews (product-scoped)
// ============================================================================

export const getProductReviews = (productId: number) => unstable_cache(
  async () => {
    const result = await reviewService.list({
      page: 1,
      limit: 50,
      sort: "created_at",
      direction: "desc",
      filters: {
        product_id: { type: "eq", value: productId },
        status: { type: "eq", value: "approved" },
      },
    });
    return result.data;
  },
  [`reviews-${CHANNEL_ID}-${productId}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "reviews"] }
)();

// ============================================================================
// Attachments (product-scoped)
// ============================================================================

export const getProductAttachments = (productId: number) => unstable_cache(
  async () => {
    const result = await productAttachmentService.listForParent(productId, {
      page: 1,
      limit: 50,
      sort: "sort_order",
      direction: "asc",
    });
    return result.data;
  },
  [`attachments-${CHANNEL_ID}-${productId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "attachments"] }
)();

// ============================================================================
// Related Products (same category)
// ============================================================================

export const getRelatedProducts = (productId: number, categoryIds: number[]) => unstable_cache(
  async () => {
    if (categoryIds.length === 0) return [];
    // Try categories from most specific to broadest, pick the first
    // that returns enough results (at least 4 related products)
    for (const catId of categoryIds) {
      const result = await productService.listForChannel(CHANNEL_ID, {
        categoryId: catId,
        limit: 13,
      });
      const related = result.products.filter((p: { id: number }) => p.id !== productId).slice(0, 12);
      if (related.length >= 4) return related;
    }
    // Fallback: use the broadest category if nothing had enough
    const result = await productService.listForChannel(CHANNEL_ID, {
      categoryId: categoryIds[categoryIds.length - 1],
      limit: 13,
    });
    return result.products.filter((p: { id: number }) => p.id !== productId).slice(0, 12);
  },
  [`related-${CHANNEL_ID}-${productId}-${categoryIds.join(",")}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "products"] }
)();

// ============================================================================
// Subscriptions (channel-scoped)
// ============================================================================

export const getSubscriptionPlans = unstable_cache(
  async () => subscriptionPlanService.listActiveForChannel(CHANNEL_ID),
  [`subscription-plans-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "subscription-plans"] }
);

export const getActiveSubscription = async (customerId: number) => {
  return subscriptionService.getActiveForCustomer(customerId, CHANNEL_ID);
};

// ============================================================================
// Draws (channel-scoped)
// ============================================================================

export const getUpcomingDraws = unstable_cache(
  async () => drawService.getUpcomingForChannel(CHANNEL_ID),
  [`upcoming-draws-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "draws"] }
);

// ============================================================================
// Partner Offers (channel-scoped)
// ============================================================================

export const getPartnerOffers = unstable_cache(
  async () => partnerOfferService.listActiveForChannel(CHANNEL_ID),
  [`partner-offers-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "partner-offers"] }
);

// ============================================================================
// Feature Flags
// ============================================================================

export const getChannelSetting = async (key: string): Promise<unknown> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value;
  } catch {
    return null;
  }
};

export const getFeatureFlag = async (key: string): Promise<boolean> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value === true || setting.setting_value === "true";
  } catch {
    return false;
  }
};

// ============================================================================
// Re-export services for direct access
// ============================================================================

// ============================================================================
// Checkout Settings
// ============================================================================

export const getCheckoutSettings = async () =>
  checkoutSettingsHelper.getCheckoutSettings(CHANNEL_ID);

export {
  channelService,
  siteService,
  channelSettingsService,
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
  customerService,
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
  CHANNEL_ID,
};
