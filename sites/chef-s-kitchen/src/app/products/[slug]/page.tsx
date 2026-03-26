import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, getActiveSubscription, customerService, CHANNEL_ID } from "@/lib/store";
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

  let memberPriceMap: Record<number, number> = {};
  if (memberPricingEnabled) {
    const session = await getSession();
    let customerGroupId: number | null = null;
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      if (activeSub) {
        const customer = await customerService.getById(session.customerId) as { customerGroupId: number | null } | null;
        customerGroupId = customer?.customerGroupId ?? null;
        isMember = true;
      }
    }
    // Fetch member prices for ALL variants so client can update on variant change
    const variants = product.variants ?? [];
    const pricingResults = await Promise.all(
      variants.map((v) => getEffectivePrice(v.id, CHANNEL_ID, customerGroupId))
    );
    for (let i = 0; i < variants.length; i++) {
      const pricing = pricingResults[i];
      if (pricing.memberPrice) {
        memberPriceMap[variants[i].id] = parseFloat(pricing.memberPrice);
      }
    }
    // Set default member price from first variant for initial render
    const defaultVariant = variants[0];
    if (defaultVariant && memberPriceMap[defaultVariant.id] != null) {
      memberPrice = memberPriceMap[defaultVariant.id];
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/products" className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 mb-6">
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
        memberPriceMap={memberPriceMap}
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
        <div className="mt-12 border-t border-zinc-200 pt-8">
          <h2 className="text-2xl font-bold text-zinc-900 mb-6">Related Products</h2>
          <ProductGrid products={relatedProducts} memberPricingAvailable={memberPricingEnabled} />
        </div>
      )}
    </div>
  );
}
