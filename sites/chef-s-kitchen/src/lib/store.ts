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

export async function getProductBySlug(slug: string) {
  return productService.getBySlug(slug, CHANNEL_ID);
}

// ============================================================================
// Categories
// ============================================================================

export const getCategories = unstable_cache(
  async () => categoryService.listVisible(CHANNEL_ID),
  [`categories-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export async function getCategoryBySlug(slug: string) {
  return categoryService.getBySlug(slug, CHANNEL_ID);
}

export async function getSubcategories(parentId: number) {
  return categoryService.getChildren(parentId);
}

export async function getCategoryStats(categoryId: number) {
  return categoryService.getCategoryStats(categoryId);
}

export async function getCategoryBreadcrumbs(pathIds: number[]) {
  return categoryService.getBreadcrumbs(pathIds);
}

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
