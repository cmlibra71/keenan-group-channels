"use client";

// ============================================================================
// ProductPageClient — legacy monolithic product overview (gallery + details).
// CMS v2.1 refactor: state lives in ProductPurchaseProvider (shared with the
// v2 widgets); JSX is verbatim pre-refactor markup. Public props unchanged.
// ============================================================================

import { ProductImageGallery, type ProductImage } from "./ProductImageGallery";
import { ProductDetail } from "./ProductDetail";
import { RichContent } from "@/components/content/RichContent";
import {
  useProductPurchase,
  type PurchaseProduct,
} from "./ProductPurchaseProvider";
import { KitPurchaseProvider } from "./KitSelection";
import type { KitPrices, ProductKit } from "@/lib/product-kit";

function ProductOverviewInner({ kit }: { kit?: ProductKit | null }) {
  const { product, variantImageUrl } = useProductPurchase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Images */}
      <ProductImageGallery
        images={product.images}
        productName={product.name}
        variantImageUrl={variantImageUrl}
        videos={product.videos ?? []}
      />

      {/* Details */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>

        {/* The group-wide Item ID, directly ABOVE the SKU and in the SKU line's own style
            (card 59ruI8uJ). The node tree gets the same line from `withItemIdNode`; this is the
            legacy renderer's copy, so switching the product design off does not lose it. No
            code, no line — never a bare label. */}
        {product.itemRef && (
          <p className="mt-1 text-sm text-zinc-500">Item ID: {product.itemRef}</p>
        )}

        {product.sku && (
          <p className="mt-1 text-sm text-zinc-500">SKU: {product.sku}</p>
        )}

        {product.descriptionShort && (
          <div className="mt-4">
            <RichContent
              html={product.descriptionShort}
              stripStyles
              className="text-sm text-zinc-600 prose prose-sm"
            />
          </div>
        )}

        <ProductDetail kit={kit} />
      </div>
    </div>
  );
}

export function ProductPageClient({
  product,
  memberPrice,
  memberPriceMap,
  isMember,
  membershipTeaser,
  kit,
  kitPrices,
}: {
  product: PurchaseProduct;
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  /** Grouped / bundle contents, read off products.metafields by the route. */
  kit?: ProductKit | null;
  /** A bundle's components at this shopper's price, ex GST (card Tc5ekvD6). */
  kitPrices?: KitPrices | null;
}) {
  return (
    <KitPurchaseProvider
      kit={kit}
      kitPrices={kitPrices}
      product={product}
      memberPrice={memberPrice ?? null}
      memberPriceMap={memberPriceMap ?? {}}
      isMember={isMember ?? false}
      membershipTeaser={membershipTeaser ?? null}
    >
      <ProductOverviewInner kit={kit} />
    </KitPurchaseProvider>
  );
}

export type { ProductImage };
