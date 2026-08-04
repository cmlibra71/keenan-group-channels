import { notFound, permanentRedirect } from "next/navigation";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import { getRedirectForPath, getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, getActiveSubscriptionForContact, getSubscriptionPlans, contactService, brandService, CHANNEL_ID, getProductBreadcrumbs, getCmsPage, getCmsTemplate } from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getSession } from "@/lib/auth";
import { getAccountId, applyAccountPrices } from "@/lib/member";
import { assertProductVisible, applyCatalogScope } from "@/lib/catalog-scope";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrandWarrantyNotes } from "@/components/product/BrandWarrantyNotes";
import { ViewedProductTracker } from "@/components/analytics/ViewedProductTracker";
import { renderProductNodeBranch } from "@/builder/product-node-branch";
import { getMemberContext } from "@/lib/member";

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
  const cachedProduct = await getProductBySlug(slug);

  if (!cachedProduct) {
    // Retired/renamed product URLs redirect (url_redirects) instead of 404ing.
    const redirect = await getRedirectForPath(`/products/${slug}`);
    if (redirect) permanentRedirect(redirect.toPath);
    notFound();
  }

  // L2 — per-account Product Restrictions + group∩contact category access. A product exclusive to
  // another account (or outside this viewer's category access) must be UNREACHABLE, not merely
  // absent from listings: a directly-navigated slug 404s. `categoryIds` come free with the cached
  // row, so this costs no extra query.
  await assertProductVisible(cachedProduct as { id: number; categoryIds?: number[] | null });

  // Per-account product prices override EVERY other price. The cached product row is shared by all
  // shoppers, so the account's price is overlaid onto a copy at read time (never into the cache).
  const accountId = await getAccountId();
  const [product] = await applyAccountPrices([cachedProduct]);

  const [reviewsRaw, attachmentsRaw, relatedRaw, brandRow] = await Promise.all([
    getProductReviews(product.id),
    getProductAttachments(product.id),
    getRelatedProducts(product.id, product.categoryIds ?? []),
    product.brandId != null
      ? (brandService.getById(product.brandId) as Promise<{ name: string | null; metafields: ProductBrandMetafields | null } | null>)
      : Promise.resolve(null),
  ]);
  // Related/upsell rail: hidden products are dropped at the SOURCE, so they cannot reach the grid,
  // the builder payload or any serialized props.
  const relatedProducts = await applyAccountPrices(await applyCatalogScope(relatedRaw));
  const brandMeta = (brandRow?.metafields ?? {}) as ProductBrandMetafields;
  const brandName = brandRow?.name ?? undefined;

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
      const activeSub = await getActiveSubscriptionForContact(session.contactId);
      if (activeSub) {
        const customer = await contactService.getById(session.contactId) as { customer_group_id: number | null } | null;
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
    if (customerGroupId || accountId) {
      const variants = product.variants ?? [];
      const pricingResults = await Promise.all(
        variants.map((v) => getEffectivePrice(v.id, CHANNEL_ID, customerGroupId, 1, accountId))
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

  // Editable CMS zones on every product page (global product template) — empty
  // unless set, so the page renders exactly as before.
  // `x-kg-json` is the parity surface: /json/products/<slug> forces the node
  // path and the draft tree, so a conversion can be diffed against this page.
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  const productCms = await getCmsPage("__product__", draft).catch(() => null);
  const prodRegion = (r: string): RenderedBlock[] =>
    ((productCms?.blocks as unknown as RenderedBlock[]) ?? []).filter((b) => b.region === r);
  const aboveDetail = prodRegion("above_detail");
  const belowDetail = prodRegion("below_detail");

  // Site Builder node path — additive. Returns null (and we fall through to the
  // block/legacy paths below) until node_product_template_enabled is on here.
  // No jsonLd is passed: this route emits no JSON-LD, and the node branch must
  // not invent structured data the native page does not claim.
  {
    const memberCtx = await getMemberContext().catch(() => null);
    const nodeRendered = await renderProductNodeBranch({
      slug,
      member: {
        customerGroupId: memberCtx?.customerGroupId ?? null,
        isMember: memberCtx?.isMember ?? false,
        loggedIn: memberCtx?.loggedIn ?? false,
        // Industry Kitchens has no membership plan teaser, so it has neither of
        // the two fields Chefs Depot uses to build one.
        planPrice: null,
        teaserCustomerGroupId: null,
        accountId: memberCtx?.accountId ?? null,
      },
      viewedProduct: {
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
          ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.urlStandard as string) ?? null,
        categories: breadcrumbs.map((c: { name: string }) => c.name),
        brand: brandRow?.name ?? null,
      },
      draft,
    });
    if (nodeRendered) return nodeRendered;
  }

  // ═══ CMS product TEMPLATE path (kill switch: flag off → legacy) ═══
  // The whole page as a block document; this route stays the data owner — the
  // heavy queries above feed the blocks via RenderContext extras.
  if (await getFeatureFlag("cms_product_template_enabled")) {
    const template = await getCmsTemplate("product", draft).catch(() => null);
    if (template && template.blocks.length > 0) {
      const context: RenderContext = {
        draft,
        record: {
          kind: "product",
          product: product as unknown as Record<string, unknown>,
          extras: {
            reviews,
            attachments,
            relatedProducts,
            brandMeta,
            breadcrumbs,
            memberPrice,
            memberPriceMap,
            isMember,
            membershipTeaser,
            memberPricingEnabled,
          },
        },
      };
      return (
        <div>
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
              brand: brandName ?? null,
            }}
          />
          <BlockRenderer
            blocks={template.blocks as unknown as RenderedBlock[]}
            draft={draft}
            context={context}
          />
        </div>
      );
    }
  }

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
          brand: brandName ?? null,
        }}
      />
      {aboveDetail.length > 0 && <BlockRenderer blocks={aboveDetail} draft={draft} />}
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
          <ProductGrid products={relatedProducts} memberPricingAvailable={memberPricingEnabled} listId="related_products" listName="Related Products" />
        </div>
      )}

      {belowDetail.length > 0 && <BlockRenderer blocks={belowDetail} draft={draft} />}
    </div>
  );
}
