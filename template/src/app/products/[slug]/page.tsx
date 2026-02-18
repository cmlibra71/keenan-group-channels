import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/lib/commerce";
import { Package, ChevronLeft } from "lucide-react";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const price = parseFloat(product.price);
  const salePrice = product.salePrice ? parseFloat(product.salePrice) : null;
  const primaryImage = product.images.find((img) => img.isThumbnail) || product.images[0];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/products" className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 mb-6">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Images */}
        <div>
          <div className="aspect-square overflow-hidden rounded-lg bg-zinc-100">
            {primaryImage ? (
              <img
                src={primaryImage.urlStandard}
                alt={primaryImage.altText || product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-zinc-300">
                <Package className="h-24 w-24" />
              </div>
            )}
          </div>

          {/* Thumbnail gallery */}
          {product.images.length > 1 && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              {product.images.map((img) => (
                <div key={img.id} className="aspect-square overflow-hidden rounded bg-zinc-100">
                  <img
                    src={img.urlThumbnail || img.urlStandard}
                    alt={img.altText || product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>

          {product.sku && (
            <p className="mt-1 text-sm text-zinc-500">SKU: {product.sku}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            {salePrice ? (
              <>
                <span className="text-3xl font-bold text-red-600">${salePrice.toFixed(2)}</span>
                <span className="text-xl text-zinc-400 line-through">${price.toFixed(2)}</span>
              </>
            ) : (
              <span className="text-3xl font-bold text-zinc-900">${price.toFixed(2)}</span>
            )}
          </div>

          {/* Availability */}
          <div className="mt-4">
            {product.inventoryLevel > 0 ? (
              <span className="text-sm text-green-600 font-medium">In Stock</span>
            ) : (
              <span className="text-sm text-red-600 font-medium">Out of Stock</span>
            )}
          </div>

          {/* Variants */}
          {product.variants.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-zinc-900">Options</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    className="px-4 py-2 rounded-lg border border-zinc-200 text-sm hover:border-zinc-400 transition-colors"
                    disabled={variant.purchasingDisabled}
                  >
                    {variant.optionDisplayName || variant.sku || `Variant ${variant.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add to Cart */}
          <div className="mt-8">
            <button className="w-full bg-zinc-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 disabled:cursor-not-allowed"
              disabled={product.inventoryLevel <= 0}
            >
              Add to Cart
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h3 className="text-lg font-semibold text-zinc-900">Description</h3>
              <div
                className="mt-3 text-sm text-zinc-600 prose prose-sm"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
