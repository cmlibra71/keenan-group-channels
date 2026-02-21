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

export async function getSiteConfig(): Promise<{ channel: Channel; site: Site | null }> {
  const channel = await channelService.getById(CHANNEL_ID) as Channel;
  const site = await siteService.getPrimaryForChannel(CHANNEL_ID) as Site | null;
  return { channel, site };
}

// ============================================================================
// Products (channel-scoped)
// ============================================================================

export async function getProducts(options?: {
  page?: number;
  limit?: number;
  categoryId?: number;
  featured?: boolean;
  search?: string;
}) {
  return productService.listForChannel(CHANNEL_ID, options);
}

export async function getProductBySlug(slug: string) {
  return productService.getBySlug(slug, CHANNEL_ID);
}

// ============================================================================
// Categories
// ============================================================================

export async function getCategories() {
  return categoryService.listVisible();
}

export async function getCategoryBySlug(slug: string) {
  return categoryService.getBySlug(slug);
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
  productService,
  productImageService,
  productVariantService,
  customerService,
  orderService,
  orderItemService,
  CHANNEL_ID,
};
