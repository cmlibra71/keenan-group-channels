import {
  CHANNEL_ID,
  attachFromPrices,
  productService,
  sanitizeCatalogProducts,
} from "@/lib/store";
import { getCommerceClient } from "@keenan/services";
import { tileButtons, tileControlsOf } from "@keenan/services/tile-controls";
import { applyAccountPrices, getListingMemberPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { cardPrice } from "@/lib/card-price";
import { buildCompareRows, type CompareFieldDefinition, type CompareRow } from "./compare-rows";

// ============================================================================
// The compare page's data (IK parity, root cause `compare-feature`).
//
// The products come through the SAME read-time chain every listing tile does
// (`ProductGrid`): the channel's visibility, the catalogue sale-price
// suppression, the viewer's catalogue scope (an account's private products stay
// private), their contract prices, and the configurable "Starting From" price.
// So a column prints the price the product's tile prints — which is what the old
// compare page printed: the list price, the sale price and ADD TO BASKET.
//
// The attribute values and short description are one extra read (the tile
// columns deliberately exclude metafields and descriptions), and the Custom
// Field definitions one more. No database writes, for anyone.
// ============================================================================

export interface CompareProduct {
  id: number;
  name: string;
  href: string;
  sku: string | null;
  brandName: string | null;
  imageUrl: string | null;
  descriptionShort: string | null;
  /** Card price: list (0 = Call for Price), real sale or null, "Starting From" flag. */
  price: { list: number; sale: number | null; from: boolean };
  memberPrice: number | null;
  /** Which buy buttons the product's own tile offers (card 1sgz4B3v rule). */
  buttons: { cart: boolean; quote: boolean };
}

export interface CompareData {
  products: CompareProduct[];
  rows: CompareRow[];
}

interface ListRow {
  id: number;
  name: string;
  sku: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  fromPrice?: string | null;
  fromSalePrice?: string | null;
  brandName: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
}

async function readDetails(
  ids: number[]
): Promise<Map<number, { fields: Record<string, unknown>; descriptionShort: string | null }>> {
  const out = new Map<number, { fields: Record<string, unknown>; descriptionShort: string | null }>();
  const sql = getCommerceClient();
  if (!sql || ids.length === 0) return out;
  const rows = await sql<{ id: number; fields: unknown; description_short: string | null }[]>`
    SELECT p.id, p.metafields->'fields' AS fields, p.description_short
    FROM products p
    WHERE p.id = ANY(${ids})`;
  for (const r of rows) {
    const fields = r.fields && typeof r.fields === "object" && !Array.isArray(r.fields) ? (r.fields as Record<string, unknown>) : {};
    out.set(Number(r.id), { fields, descriptionShort: r.description_short });
  }
  return out;
}

async function readDefinitions(): Promise<CompareFieldDefinition[]> {
  const sql = getCommerceClient();
  if (!sql) return [];
  // Global + this channel's own, active — the definitions `getProductPageData` exposes as
  // `product.fields` (services `restrictToDefinedFields`), so a value authored for another
  // storefront never shows here.
  const rows = await sql<
    { code: string; label: string; source_id: string | null; sort_order: number; options: unknown }[]
  >`
    SELECT code, label, source_id, sort_order, options
    FROM custom_field_definitions
    WHERE entity_type = 'product'
      AND is_active = true
      AND (channel_id IS NULL OR channel_id = ${CHANNEL_ID})`;
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    sourceId: r.source_id,
    sortOrder: Number(r.sort_order) || 0,
    options: r.options,
  }));
}

/** The products in `ids` this viewer may see, in list order, with their comparable rows. */
export async function loadCompareData(ids: number[]): Promise<CompareData> {
  if (ids.length === 0) return { products: [], rows: [] };

  const listed = await productService.listForChannel(CHANNEL_ID, { ids, limit: ids.length });
  let rows = (await sanitizeCatalogProducts(listed.products as unknown as ListRow[])) as ListRow[];
  rows = await applyCatalogScope(rows);
  rows = await applyAccountPrices(rows);
  rows = (await attachFromPrices(rows)) as ListRow[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is ListRow => r != null);
  const visibleIds = ordered.map((r) => r.id);

  const [details, definitions, memberPrices] = await Promise.all([
    readDetails(visibleIds).catch(() => new Map()),
    readDefinitions().catch(() => []),
    getListingMemberPrices(ordered).catch(() => ({}) as Record<number, number>),
  ]);

  const products: CompareProduct[] = ordered.map((r) => {
    const price = cardPrice(r);
    return {
      id: r.id,
      name: r.name,
      href: `/products/${r.urlPath || r.id}`,
      sku: r.sku,
      brandName: r.brandName,
      imageUrl: r.thumbnailImage?.urlStandard || r.thumbnailImage?.urlThumbnail || null,
      descriptionShort: details.get(r.id)?.descriptionShort ?? null,
      price,
      memberPrice: memberPrices[r.id] ?? null,
      buttons: tileButtons(tileControlsOf(r), price.list > 0),
    };
  });

  return {
    products,
    rows: buildCompareRows(
      definitions,
      products.map((p) => details.get(p.id)?.fields ?? null)
    ),
  };
}
