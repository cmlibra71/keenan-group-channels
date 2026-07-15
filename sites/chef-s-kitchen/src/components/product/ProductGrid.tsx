import { ProductCard } from "./ProductCard";
import { applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

interface ProductWithImage {
  id: number;
  name: string;
  sku?: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  brandName?: string | null;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

/**
 * Design-system product grid: 4-up ≥1024 / 3-up 768 / 2-up mobile (3-up max
 * when `narrow` — beside the category filter rail).
 */
/**
 * Server component. Every listing card in the site funnels through here, so this is where the
 * shopper's per-account contract prices are applied — at READ time, to the rows already fetched
 * from the SHARED sources (category_listing_cache, unstable_cache, the Meilisearch index), which
 * cannot hold a per-account price without leaking it to every other shopper. Guests: no-op.
 */
export async function ProductGrid({
  products,
  memberPricingAvailable,
  memberPriceMap,
  isMember,
  planPrice,
  eyebrow,
  clearance,
  narrow,
  listId,
  listName,
}: {
  products: ProductWithImage[];
  memberPricingAvailable?: boolean;
  /** Member prices keyed by product id (computed for guests too — join funnel). */
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
  /** Category eyebrow shown on each card. */
  eyebrow?: string | null;
  clearance?: boolean;
  /** 3-up max — used beside the category filter rail. */
  narrow?: boolean;
  /** GA4 list identity for view_item_list / select_item (e.g. category slug + name). */
  listId?: string;
  listName?: string;
}) {
  // Hide before pricing. Rows arrive from the SHARED category_listing_cache / unstable_cache /
  // Meilisearch index, which cannot encode per-account visibility or price — both are applied HERE,
  // per viewer, to a copy. Guests still get the visibility pass (other accounts' exclusive products
  // are hidden from them too).
  products = await applyCatalogScope(products);
  products = await applyAccountPrices(products);
  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-text-muted">No products found.</p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${
        narrow ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"
      }`}
    >
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          sku={product.sku}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          brandName={product.brandName}
          eyebrow={eyebrow}
          memberPrice={memberPricingAvailable ? memberPriceMap?.[product.id] ?? null : null}
          isMember={isMember}
          planPrice={planPrice}
          clearance={clearance}
          availability={product.availability}
          inventoryLevel={product.inventoryLevel}
          inventoryTracking={product.inventoryTracking}
          listId={listId}
          listName={listName}
          listIndex={index}
        />
      ))}
    </div>
  );
}
