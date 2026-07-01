import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, getActiveSubscription, getSubscriptionPlans, customerService, brandService, CHANNEL_ID, getProductBreadcrumbs } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrandWarrantyNotes } from "@/components/product/BrandWarrantyNotes";
import { ViewedProductTracker } from "@/components/analytics/ViewedProductTracker";

type ProductBrandMetafields = {
  intro_html?: string;
  warranty_text?: string;
  extended_warranty?: { name: string; body: string; link?: string };
  installation_notes?: string[];
};

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

  const [reviewsRaw, attachmentsRaw, relatedProducts, brandRow] = await Promise.all([
    getProductReviews(product.id),
    getProductAttachments(product.id),
    getRelatedProducts(product.id, product.categoryIds ?? []),
    product.brandId != null
      ? (brandService.getById(product.brandId) as Promise<{ metafields: ProductBrandMetafields | null } | null>)
      : Promise.resolve(null),
  ]);
  const brandMeta = (brandRow?.metafields ?? {}) as ProductBrandMetafields;

  // Breadcrumb trail scoped to this channel's own category tree. A product's
  // category assignments can span other channels' trees, so resolving through
  // the channel guarantees every crumb links to a category page that exists here.
  const breadcrumbs = (await getProductBreadcrumbs(product.id)) as {
    id: number;
    name: string;
    slug: string;
  }[];

  // Fetch member pricing if feature is enabled
  let memberPrice: number | null = null;
  let isMember = false;
  let membershipTeaser: { fromPrice: string | null } | null = null;
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");

  let memberPriceMap: Record<number, number> = {};
  if (memberPricingEnabled) {
    const session = await getSession();
    let customerGroupId: number | null = null;
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      if (activeSub) {
        const customer = await customerService.getById(session.customerId) as { customer_group_id: number | null } | null;
        customerGroupId = customer?.customer_group_id ?? null;
        isMember = true;
      }
    }
    // Non-members get a generic membership pitch (never the exact member price).
    if (!isMember) {
      const plans = (await getSubscriptionPlans()) as { price: string | null }[];
      const cheapest = plans
        .map((p) => (p.price != null ? parseFloat(p.price) : NaN))
        .filter((p) => Number.isFinite(p))
        .sort((a, b) => a - b)[0];
      membershipTeaser = { fromPrice: cheapest != null && Number.isFinite(cheapest) ? cheapest.toFixed(2) : null };
    }

    // Fetch member prices for ALL variants (only for actual members — the
    // customer's group is what unlocks member pricing) so the client can update
    // the displayed price on variant change.
    if (customerGroupId) {
      const variants = product.variants ?? [];
      const pricingResults = await Promise.all(
        variants.map((v) => getEffectivePrice(v.id, CHANNEL_ID, customerGroupId))
      );
      for (let i = 0; i < variants.length; i++) {
        const pricing = pricingResults[i];
        if (pricing.salePrice) {
          memberPriceMap[variants[i].id] = parseFloat(pricing.salePrice);
        }
      }
      // Set default member price from first variant for initial render
      const defaultVariant = variants[0];
      if (defaultVariant && memberPriceMap[defaultVariant.id] != null) {
        memberPrice = memberPriceMap[defaultVariant.id];
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <ViewedProductTracker
        product={{
          id: product.id,
          sku: product.sku,
          name: product.name,
          price:
            product.salePrice != null
              ? parseFloat(String(product.salePrice))
              : product.price != null
                ? parseFloat(String(product.price))
                : null,
          imageUrl:
            ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.urlStandard as string) ??
            ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.url_standard as string) ??
            null,
          categories: breadcrumbs.map((c: { name: string }) => c.name),
        }}
      />
      {breadcrumbs.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
          <Link href="/products" className="hover:text-zinc-600">Products</Link>
          {breadcrumbs.map((crumb: { id: number; name: string; slug: string }) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-zinc-600">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-zinc-700 truncate max-w-[200px]">{product.name}</span>
        </nav>
      ) : (
        <BackButton fallbackHref="/products" fallbackLabel="Back to Products" className="mb-6" />
      )}

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
        membershipTeaser={membershipTeaser}
      />

      {/* Brand-specific warranty / installation notes (conditional) */}
      <BrandWarrantyNotes
        warranty_text={brandMeta.warranty_text}
        extended_warranty={brandMeta.extended_warranty}
        installation_notes={brandMeta.installation_notes}
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
