import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, customerService, CHANNEL_ID } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { ChevronLeft } from "lucide-react";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";

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

  const [reviewsRaw, attachmentsRaw, relatedProducts] = await Promise.all([
    getProductReviews(product.id),
    getProductAttachments(product.id),
    getRelatedProducts(product.id, product.categoryIds ?? []),
  ]);

  // Fetch member pricing if feature is enabled
  let memberPrice: number | null = null;
  let isMember = false;
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");

  if (memberPricingEnabled) {
    const session = await getSession();
    let customerGroupId: number | null = null;
    if (session) {
      const customer = await customerService.getById(session.customerId) as { customerGroupId: number | null } | null;
      customerGroupId = customer?.customerGroupId ?? null;
      isMember = !!customerGroupId;
    }
    const defaultVariant = product.variants?.[0];
    if (defaultVariant) {
      const pricing = await getEffectivePrice(defaultVariant.id, CHANNEL_ID, customerGroupId);
      if (pricing.memberPrice) {
        memberPrice = parseFloat(pricing.memberPrice);
      }
    }
  }

  const reviews = reviewsRaw as {
    id: number;
    rating: number;
    title: string | null;
    text: string | null;
    author_name: string | null;
    created_at: string | Date | null;
  }[];

  const attachments = attachmentsRaw as {
    id: number;
    fileName: string;
    url: string;
    label: string | null;
    fileType: string | null;
    fileSize: number | null;
  }[];

  return (
    <div className="container-page section-padding">
      <Link href="/products" className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors duration-300">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      <ProductPageClient
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          salePrice: product.salePrice,
          inventoryLevel: product.inventoryLevel ?? 0,
          inventoryTracking: product.inventoryTracking ?? "none",
          availability: product.availability ?? "available",
          descriptionShort: product.descriptionShort,
          images: product.images,
          variants: product.variants,
          options: product.options ?? [],
          optionValues: product.optionValues ?? [],
          variantOptionMappings: product.variantOptionMappings ?? [],
          bulkPricing: product.bulkPricing ?? [],
        }}
        memberPrice={memberPrice}
        isMember={isMember}
      />

      {/* Tabbed content section */}
      <ProductTabs
        description={product.description}
        warranty={product.warranty ?? null}
        customFields={product.customFields as Record<string, unknown> | null}
        reviews={reviews}
        attachments={attachments}
        productId={product.id}
      />

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-12 border-t border-border pt-8">
          <p className="eyebrow mb-3">YOU MAY ALSO LIKE</p>
          <h2 className="text-2xl heading-serif text-text-primary mb-6">Related Products</h2>
          <ProductGrid products={relatedProducts} memberPricingAvailable={memberPricingEnabled} />
        </div>
      )}
    </div>
  );
}
