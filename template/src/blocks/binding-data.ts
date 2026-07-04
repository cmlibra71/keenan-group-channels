// ============================================================================
// Binding data — maps a RenderContext to the KTL data object. template/IK.
// ============================================================================
import type { RenderContext } from "@keenan/services";

type AnyRecord = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export function buildBindingData(ctx?: RenderContext): AnyRecord {
  if (ctx?.record?.kind === "product") {
    const p = ctx.record.product as AnyRecord;
    const extras = (ctx.record.extras ?? {}) as AnyRecord;
    const brandRow = extras.brandRow as { name?: string | null; slug?: string | null } | null;
    const crumbs = (extras.breadcrumbs as AnyRecord[]) ?? [];
    const lastCrumb = crumbs.length > 0 ? crumbs[crumbs.length - 1] : null;
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
      },
      brand: { name: brandRow?.name ?? null, slug: brandRow?.slug ?? null },
      breadcrumbs: crumbs.slice(0, -1),
      lastCrumb: lastCrumb ? { name: lastCrumb.name ?? "", slug: lastCrumb.slug ?? "" } : { name: "", slug: "" },
      settings: { channelName: "Store", membershipFromPrice: null },
    };
  }

  if (ctx?.record?.kind === "category") {
    const c = ctx.record.category as AnyRecord;
    const extras = (ctx.record.extras ?? {}) as AnyRecord;
    const listing = extras.listing as { total?: number; products?: unknown[] } | undefined;
    const total = listing?.total ?? 0;
    const shown = listing?.products?.length ?? 0;
    const crumbs = (extras.breadcrumbs as AnyRecord[]) ?? [];
    return {
      category: {
        id: c.id,
        name: c.name ?? "",
        description: c.description ?? "",
        image: (c.image_url as string) ?? null,
      },
      breadcrumbs: crumbs.slice(0, -1),
      listing: {
        total,
        totalLabel: `${total} product${total === 1 ? "" : "s"}`,
        showingRange: `1–${shown}`,
      },
      settings: { channelName: "Store", membershipFromPrice: null },
    };
  }

  return { settings: { channelName: "Store", membershipFromPrice: null } };
}
