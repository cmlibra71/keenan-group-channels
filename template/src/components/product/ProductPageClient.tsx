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
  ProductPurchaseProvider,
  useProductPurchase,
  type PurchaseProduct,
} from "./ProductPurchaseProvider";

function ProductOverviewInner() {
  const { product, variantImageUrl } = useProductPurchase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Images */}
      <ProductImageGallery
        images={product.images}
        productName={product.name}
        variantImageUrl={variantImageUrl}
      />

      {/* Details */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>

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

        <ProductDetail />
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
}: {
  product: PurchaseProduct;
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
}) {
  return (
    <ProductPurchaseProvider
      product={product}
      memberPrice={memberPrice ?? null}
      memberPriceMap={memberPriceMap ?? {}}
      isMember={isMember ?? false}
      membershipTeaser={membershipTeaser ?? null}
    >
      <ProductOverviewInner />
    </ProductPurchaseProvider>
  );
}

export type { ProductImage };
