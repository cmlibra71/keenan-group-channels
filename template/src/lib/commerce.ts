import { initCommerceDb, getCommerceDb } from "@keenan/commerce";
import {
  channelService,
  siteService,
  channelSettingsService,
  brandService,
  categoryService,
  categoryTreeService,
  cartService,
  cartItemService,
} from "@keenan/commerce";
import { eq, and, inArray } from "drizzle-orm";
import {
  products,
  productImages,
  productVariants,
  productChannelAssignments,
  productCategories,
  categories,
  channels,
  sites,
  type Product,
  type Channel,
  type Site,
} from "@keenan/commerce";

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
  const db = getCommerceDb();

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, CHANNEL_ID))
    .limit(1);

  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.channelId, CHANNEL_ID), eq(sites.isPrimary, true)))
    .limit(1);

  return { channel: channel as Channel, site: (site as Site) || null };
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
  const db = getCommerceDb();
  const { page = 1, limit = 20, categoryId, featured, search } = options || {};

  // Get product IDs visible on this channel
  const assignments = await db
    .select({ productId: productChannelAssignments.productId })
    .from(productChannelAssignments)
    .where(
      and(
        eq(productChannelAssignments.channelId, CHANNEL_ID),
        eq(productChannelAssignments.isVisible, true)
      )
    );

  const visibleIds = assignments.map((a) => a.productId);
  if (visibleIds.length === 0) return { products: [], total: 0 };

  // Build conditions
  let conditions = and(
    inArray(products.id, visibleIds),
    eq(products.isVisible, true),
    eq(products.isDeleted, false)
  );

  if (featured) {
    conditions = and(conditions, eq(products.isFeatured, true));
  }

  // Category filter
  if (categoryId) {
    const productIds = await db
      .select({ productId: productCategories.productId })
      .from(productCategories)
      .where(eq(productCategories.categoryId, categoryId));

    const catProductIds = productIds.map((p) => p.productId);
    if (catProductIds.length === 0) return { products: [], total: 0 };
    conditions = and(conditions, inArray(products.id, catProductIds));
  }

  const results = await db
    .select()
    .from(products)
    .where(conditions)
    .limit(limit)
    .offset((page - 1) * limit)
    .orderBy(products.name);

  // Get images for these products
  const productIds = results.map((p) => p.id);
  const images = productIds.length > 0
    ? await db
        .select()
        .from(productImages)
        .where(
          and(
            inArray(productImages.productId, productIds),
            eq(productImages.isThumbnail, true)
          )
        )
    : [];

  const imageMap = new Map(images.map((img) => [img.productId, img]));

  const productsWithImages = results.map((product) => ({
    ...product,
    thumbnailImage: imageMap.get(product.id) || null,
  }));

  return { products: productsWithImages, total: visibleIds.length };
}

export async function getProductBySlug(slug: string) {
  const db = getCommerceDb();

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.urlPath, slug),
        eq(products.isVisible, true),
        eq(products.isDeleted, false)
      )
    )
    .limit(1);

  if (!product) return null;

  // Verify it's assigned to this channel
  const [assignment] = await db
    .select()
    .from(productChannelAssignments)
    .where(
      and(
        eq(productChannelAssignments.productId, product.id),
        eq(productChannelAssignments.channelId, CHANNEL_ID),
        eq(productChannelAssignments.isVisible, true)
      )
    )
    .limit(1);

  if (!assignment) return null;

  // Get images, variants
  const [images, variants] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(productImages.sortOrder),
    db.select().from(productVariants).where(eq(productVariants.productId, product.id)).orderBy(productVariants.sortOrder),
  ]);

  return { ...product, images, variants };
}

// ============================================================================
// Categories (channel-scoped)
// ============================================================================

export async function getCategories() {
  const db = getCommerceDb();

  // Get category trees for this channel
  const trees = await db
    .select()
    .from(categories)
    .where(eq(categories.isVisible, true))
    .orderBy(categories.sortOrder);

  return trees;
}

export async function getCategoryBySlug(slug: string) {
  const db = getCommerceDb();

  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isVisible, true)))
    .limit(1);

  return category || null;
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
  CHANNEL_ID,
};
