// ============================================================================
// Binding data — maps a RenderContext to the KTL data object (the paths the
// binding catalog in @keenan/services cms/bindings.ts advertises). Per-fork
// because record shapes/extras differ between the CD and IK generations.
// ============================================================================
import type { RenderContext } from "@keenan/services";

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

type AnyRecord = Record<string, unknown>;

/** Product-card shape (the product_card partial's data contract). */
export function productCardData(p: AnyRecord): AnyRecord {
  return {
    id: p.id,
    name: p.name ?? "",
    sku: p.sku ?? "",
    slug: (p.urlPath as string) ?? (p.url_path as string) ?? String(p.id),
    price: num(p.price),
    salePrice: num(p.salePrice ?? p.sale_price),
    imageUrl:
      ((p.images as AnyRecord[] | undefined)?.[0]?.urlStandard as string) ??
      ((p.images as AnyRecord[] | undefined)?.[0]?.url_standard as string) ??
      (p.imageUrl as string) ??
      null,
    brandName: (p.brandName as string) ?? null,
    inventoryLevel: num(p.inventoryLevel ?? p.inventory_level) ?? 0,
    memberPrice: num(p.memberPrice),
  };
}

/** KTL data for product-kind contexts (product template, product blocks). */
export function buildBindingData(ctx?: RenderContext): AnyRecord {
  if (ctx?.record?.kind === "product") {
    const p = ctx.record.product as AnyRecord;
    const extras = (ctx.record.extras ?? {}) as AnyRecord;
    const brandRow = extras.brandRow as { name?: string | null; slug?: string | null } | null;
    const reviewSummary = extras.reviewSummary as { avg: number; count: number } | null;
    const teaser = extras.membershipTeaser as { fromPrice: string | null } | null;

    const customFields = Object.entries((p.customFields as AnyRecord) ?? {})
      .filter(([key]) => key !== "tabs" && key !== "leaseOptions")
      .map(([key, value]) => ({ key, value: String(value ?? "") }));

    return {
      product: {
        id: p.id,
        name: p.name ?? "",
        sku: p.sku ?? "",
        slug: (p.urlPath as string) ?? String(p.id),
        price: num(p.price),
        salePrice: num(p.salePrice),
        availability: p.availability ?? "available",
        inventoryLevel: num(p.inventoryLevel) ?? 0,
        descriptionShort: p.descriptionShort ?? "",
        description: p.description ?? "",
        warranty: p.warranty ?? "",
        hasVariants: Array.isArray(p.variants) && (p.variants as unknown[]).length > 0,
        images: ((p.images as AnyRecord[]) ?? []).map((img) => ({
          url: (img.urlStandard as string) ?? (img.url_standard as string) ?? (img.url as string) ?? "",
          alt: (img.description as string) ?? "",
        })),
        customFields,
      },
      brand: { name: brandRow?.name ?? null, slug: brandRow?.slug ?? null },
      reviews: { avg: reviewSummary?.avg ?? 0, count: reviewSummary?.count ?? 0 },
      breadcrumbs: (extras.breadcrumbs as AnyRecord[]) ?? [],
      related: ((extras.relatedProducts as AnyRecord[]) ?? []).map(productCardData),
      settings: {
        channelName: "Chef's Depot",
        membershipFromPrice: num(teaser?.fromPrice),
      },
    };
  }

  if (ctx?.record?.kind === "category") {
    const c = ctx.record.category as AnyRecord;
    const extras = (ctx.record.extras ?? {}) as AnyRecord;
    const listing = extras.listing as { total?: number } | undefined;
    return {
      category: {
        id: c.id,
        name: c.name ?? "",
        description: c.description ?? "",
        image: (c.image_url as string) ?? null,
      },
      subcategories: ((extras.subcategories as AnyRecord[]) ?? []).map((s) => ({
        name: s.name ?? "",
        slug: s.slug ?? "",
        imageUrl: (s.imageUrl as string) ?? null,
      })),
      breadcrumbs: (extras.breadcrumbs as AnyRecord[]) ?? [],
      listing: { total: listing?.total ?? 0 },
      settings: { channelName: "Chef's Depot", membershipFromPrice: null },
    };
  }

  return { settings: { channelName: "Chef's Depot", membershipFromPrice: null } };
}
