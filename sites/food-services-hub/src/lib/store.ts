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

export async function getSiteConfig(): Promise<{ channel: Channel | null; site: Site | null }> {
  try {
    const channel = await channelService.getById(CHANNEL_ID) as Channel;
    const site = await siteService.getPrimaryForChannel(CHANNEL_ID) as Site | null;
    return { channel, site };
  } catch {
    // DB unavailable (e.g. during Docker build with dummy URL)
    return { channel: null, site: null };
  }
}

// ============================================================================
// Products (channel-scoped)
// ============================================================================

export async function getProducts(options?: {
  page?: number;
  limit?: number;
  categoryId?: number;
  featured?: boolean;
  onSale?: boolean;
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
  return categoryService.listVisible(CHANNEL_ID);
}

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
