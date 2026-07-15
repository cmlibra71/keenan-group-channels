import { ProductCard } from "./ProductCard";
import { applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

interface ProductWithImage {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

/**
 * Server component. Every listing card in the site funnels through here, so this is where the
 * shopper's per-account VISIBILITY and per-account contract PRICES are applied — at READ time, to
 * the rows already fetched from the SHARED sources (category_listing_cache, unstable_cache, the
 * Meilisearch index), none of which can hold per-account state without leaking one account's
 * private products / negotiated prices to every other shopper. Guests: visibility still applies
 * (they never see another account's exclusive products); prices are a no-op.
 *
 * Order matters: hide first, then price — an invisible row is never priced or emitted to GA4.
 */
export async function ProductGrid({
  products,
  memberPricingAvailable,
  memberPriceMap,
  listId,
  listName,
}: {
  products: ProductWithImage[];
  memberPricingAvailable?: boolean;
  /** Active member's prices keyed by product id (from getMemberPriceMap). */
  memberPriceMap?: Record<number, number>;
  /** GA4 list identity for view_item_list / select_item (e.g. category slug + name). */
  listId?: string;
  listName?: string;
}) {
  products = await applyCatalogScope(products);
  products = await applyAccountPrices(products);
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: String(p.id),
          item_name: p.name,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          productId={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          memberPricingAvailable={memberPricingAvailable}
          memberPrice={memberPriceMap?.[product.id] ?? null}
          listId={listId}
          listName={listName}
          listIndex={index}
        />
      ))}
    </div>
  );
}
