import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/lib/store";
import { ChevronLeft } from "lucide-react";
import { ProductDetail } from "@/components/product/ProductDetail";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import { RichContent } from "@/components/content/RichContent";

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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/products" className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 mb-6">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Images */}
        <ProductImageGallery images={product.images} productName={product.name} />

        {/* Details */}
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>

          {product.sku && (
            <p className="mt-1 text-sm text-zinc-500">SKU: {product.sku}</p>
          )}

          <ProductDetail
            productId={product.id}
            price={product.price}
            salePrice={product.salePrice}
            inventoryLevel={product.inventoryLevel ?? 0}
            inventoryTracking={product.inventoryTracking ?? "none"}
            availability={product.availability ?? "available"}
            variants={product.variants}
          />

          {/* Description */}
          {product.description && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h3 className="text-lg font-semibold text-zinc-900">Description</h3>
              <RichContent
                html={product.description}
                stripStyles
                className="mt-3 text-sm text-zinc-600 prose prose-sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
