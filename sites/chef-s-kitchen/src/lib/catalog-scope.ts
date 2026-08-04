import { cache } from "react";
import { notFound } from "next/navigation";
import {
  resolveCatalogScope,
  filterProductsByCatalogScope,
  isProductVisibleToCatalogScope,
  isCategoryAccessible,
  findBlockedProductIds,
  type CatalogViewerScope,
} from "@keenan/services";
import { getSession } from "@/lib/auth";
import { getAccountId } from "@/lib/member";

/**
 * L2 Phase B — the storefront's SINGLE catalogue-visibility chokepoint.
 *
 * Two restriction layers are enforced here, both resolved in @keenan/services (`catalogScope.ts`):
 *   • per-ACCOUNT product restrictions — Zoey's exclusivity model: a product on ANY account's list
 *     is private to that account and disappears for every other account AND for guests;
 *   • per-GROUP ∩ per-CONTACT category access — previously enforced on `/products` ONLY (so a
 *     "restricted" category's products were still reachable via PDP, search, category pages and the
 *     listing cache). Both now ride the same chokepoint.
 *
 * WHY READ TIME, ALWAYS. Listing rows come from SHARED, viewer-independent artefacts — the
 * `category_listing_cache` table, Next's `unstable_cache`d accessors and the Meilisearch index.
 * None can encode per-account visibility without leaking one account's private products to every
 * shopper. So the viewer's scope is resolved per request and applied to the rows AFTER they come
 * out of those shared sources — exactly the L1 `applyAccountPrices` pattern. No `accountId` is ever
 * passed into a cache key, a cache builder or an indexer; nothing here writes back.
 *
 * COVERAGE (every catalogue read path funnels through one of these):
 *   grid cards  → `<ProductGrid>` + `<CardPartialGrid>` (builder-rendered rails)  → applyCatalogScope
 *   PDP         → app/products/[slug] (+ node-preview)                            → assertProductVisible
 *   category    → app/categories/[slug]                                           → assertCategoryVisible
 *   search      → /api/search (Meili hits) + /search (grid)                       → applyCatalogScopeBy / grid
 *   cart/quote  → addToCart, addToQuote, getCart, placeOrder                      → isProductVisibleToViewer / blockedProductIds
 *   sitemap     → guest scope (crawlers are guests)                               → applyGuestCatalogScope
 */

/**
 * The viewer's scope, memoised per request (every surface on a page asks for it).
 * The account comes from the SAME resolution L1 pricing and L3 account-options use
 * (`getAccountId` → `resolveAccountIdForContact`, i.e. the contact's default membership).
 */
export const getCatalogScope = cache(async (): Promise<CatalogViewerScope> => {
  const [session, accountId] = await Promise.all([getSession(), getAccountId()]);
  return resolveCatalogScope({ contactId: session?.contactId ?? null, accountId });
});

/**
 * Drop rows this shopper may not see. Rows in → permitted rows out (a copy; the source is untouched).
 * Array-generic (like `applyAccountPrices`) so a union of row shapes survives the call.
 */
export async function applyCatalogScope<T extends { id: number }[]>(products: T): Promise<T> {
  if (products.length === 0) return products;
  return filterProductsByCatalogScope(products as { id: number }[], await getCatalogScope()) as Promise<T>;
}

/** Same, for rows keyed by something other than `id` (Meili hits, cart lines). */
export async function applyCatalogScopeBy<T>(
  rows: T[],
  getId: (row: T) => number
): Promise<T[]> {
  if (rows.length === 0) return rows;
  return filterProductsByCatalogScope(rows, await getCatalogScope(), getId);
}

/**
 * The guest scope, memoised per request like `getCatalogScope`.
 *
 * The sitemap applies guest scope once per 10,000-row batch, so without this
 * every batch re-resolved the whole scope — 4–5 redundant round trips per build.
 */
export const getGuestCatalogScope = cache(
  async (): Promise<CatalogViewerScope> =>
    resolveCatalogScope({ contactId: null, accountId: null })
);

/** The GUEST view — for shared/crawler artefacts (sitemap): the public catalogue minus every account's exclusives. */
export async function applyGuestCatalogScope<T extends { id: number }>(products: T[]): Promise<T[]> {
  if (products.length === 0) return products;
  return filterProductsByCatalogScope(products, await getGuestCatalogScope());
}

/** May this shopper reach this product at all? (PDP, add-to-cart, add-to-quote.) */
export async function isProductVisibleToViewer(
  productId: number,
  categoryIds?: number[] | null
): Promise<boolean> {
  return isProductVisibleToCatalogScope(productId, await getCatalogScope(), categoryIds);
}

/**
 * PDP guard: a restricted product must 404 for anyone who may not see it — never render.
 * `categoryIds` come free with `getProductBySlug`, so the category check costs no extra query.
 */
export async function assertProductVisible(product: {
  id: number;
  categoryIds?: number[] | null;
}): Promise<void> {
  if (!(await isProductVisibleToViewer(product.id, product.categoryIds ?? null))) notFound();
}

/** Category-page guard: a category outside the viewer's access 404s. */
export async function assertCategoryVisible(categoryId: number): Promise<void> {
  if (!isCategoryAccessible(categoryId, await getCatalogScope())) notFound();
}

/**
 * "What we show is what we accept" — the ids on this basket the shopper may NOT buy (hidden since
 * they were added, or never visible and poked in by hand). Empty ⇒ the basket is clean.
 */
export async function blockedProductIds(productIds: number[]): Promise<number[]> {
  return findBlockedProductIds(productIds, await getCatalogScope());
}

/** The message a rejected add-to-cart / add-to-quote / checkout returns. */
export const RESTRICTED_PRODUCT_ERROR = "This product isn't available on your account.";
