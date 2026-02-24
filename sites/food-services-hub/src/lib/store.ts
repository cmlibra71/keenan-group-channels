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
  productService,
  productImageService,
  productVariantService,
  customerService,
  orderService,
  orderItemService,
} from "@keenan/services";
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

export const getProducts = unstable_cache(
  async (options?: {
    page?: number;
    limit?: number;
    categoryId?: number;
    featured?: boolean;
    onSale?: boolean;
    search?: string;
  }) => productService.listForChannel(CHANNEL_ID, options),
  [`products-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "products"] }
);

export const getProductBySlug = unstable_cache(
  async (slug: string) => productService.getBySlug(slug, CHANNEL_ID),
  [`product-slug-${CHANNEL_ID}`],
  { revalidate: 120, tags: [`channel-${CHANNEL_ID}`, "products"] }
);

// ============================================================================
// Categories
// ============================================================================

export const getCategories = unstable_cache(
  async () => categoryService.listVisible(CHANNEL_ID),
  [`categories-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getCategoryBySlug = unstable_cache(
  async (slug: string) => categoryService.getBySlug(slug, CHANNEL_ID),
  [`category-slug-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getSubcategories = unstable_cache(
  async (parentId: number) => categoryService.getChildren(parentId),
  [`subcategories-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getCategoryStats = unstable_cache(
  async (categoryId: number) => categoryService.getCategoryStats(categoryId),
  [`category-stats-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getCategoryBreadcrumbs = unstable_cache(
  async (pathIds: number[]) => categoryService.getBreadcrumbs(pathIds),
  [`category-breadcrumbs-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

// ============================================================================
// Re-export services for direct access
// ============================================================================

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
  productService,
  productImageService,
  productVariantService,
  customerService,
  orderService,
  orderItemService,
  CHANNEL_ID,
};
