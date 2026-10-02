import {
  CHANNEL_ID,
  attachFromPrices,
  productService,
  sanitizeCatalogProducts,
} from "@/lib/store";
import { getCommerceClient } from "@keenan/services";
import { applyAccountPrices, getListingMemberPrices, getPricingGroupId } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { cardPrice } from "@/lib/card-price";
import { buildCompareRows, type CompareFieldDefinition, type CompareRow } from "./compare-rows";
import { compareBuyButtons } from "./compare-buy";
import { tileRequiredQuestions } from "@keenan/services";
import { isProductId } from "./compare-list";
import { readProductKit, tileKitChoices, type KitChoice } from "@/lib/product-kit";
import { readChannelRules } from "@keenan/services/channel-rules";
import { getSession } from "@/lib/auth";

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
  /** Which buy buttons the product's OWN PAGE offers (`compare-buy.ts`). */
  buttons: { cart: boolean; quote: boolean };
  /** The product asks a required question (default or not) — the column says View Details. */
  answerRequired: boolean;
  /** `hide_price`: the column says "Call for Price", as the page's masked price does. */
  priceHidden: boolean;
  /** A bundle: its quote carries the kit's marked defaults (the tile's build), or null. */
  isBundle: boolean;
  kitChoices: KitChoice[] | null;
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
  restrictAddToCart?: boolean | null;
  restrictAddToQuote?: boolean | null;
  purchasingDisabled?: boolean | null;
}

interface DetailRow {
  fields: Record<string, unknown>;
  descriptionShort: string | null;
  metafields: unknown;
  hidePrice: boolean;
  inventoryTracking: string | null;
  inventoryLevel: number | null;
  backorderPolicy: string | null;
}

async function readDetails(ids: number[]): Promise<Map<number, DetailRow>> {
  const out = new Map<number, DetailRow>();
  const sql = getCommerceClient();
  if (!sql || ids.length === 0) return out;
  const rows = await sql<
    {
      id: number;
      metafields: unknown;
      description_short: string | null;
      hide_price: boolean | null;
      inventory_tracking: string | null;
      inventory_level: number | null;
      backorder_policy: string | null;
    }[]
  >`
    SELECT p.id, p.metafields, p.description_short, p.hide_price,
           p.inventory_tracking, p.inventory_level::int AS inventory_level, p.backorder_policy
    FROM products p
    WHERE p.id = ANY(${ids})`;
  for (const r of rows) {
    const meta = r.metafields && typeof r.metafields === "object" ? (r.metafields as Record<string, unknown>) : {};
    const f = meta.fields;
    out.set(Number(r.id), {
      fields: f && typeof f === "object" && !Array.isArray(f) ? (f as Record<string, unknown>) : {},
      descriptionShort: r.description_short,
      metafields: meta,
      hidePrice: r.hide_price === true,
      inventoryTracking: r.inventory_tracking,
      inventoryLevel: r.inventory_level == null ? null : Number(r.inventory_level),
      backorderPolicy: r.backorder_policy,
    });
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
    { code: string; label: string; source_id: string | null; sort_order: number; options: unknown; storefront_display: unknown }[]
  >`
    SELECT code, label, source_id, sort_order, options, storefront_display
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
    // D18: the definition's "Show on compare page" flag and order.
    storefrontDisplay: r.storefront_display,
  }));
}

/** The products in `ids` this viewer may see, in list order, with their comparable rows. */
export async function loadCompareData(requested: number[]): Promise<CompareData> {
  // Belt and braces with `parseCompareList`: an id Postgres cannot hold never reaches a query.
  const ids = requested.filter(isProductId);
  if (ids.length === 0) return { products: [], rows: [] };

  const listed = await productService.listForChannel(CHANNEL_ID, { ids, limit: ids.length });
  let rows = (await sanitizeCatalogProducts(listed.products as unknown as ListRow[])) as ListRow[];
  rows = await applyCatalogScope(rows);
  rows = await applyAccountPrices(rows);
  rows = (await attachFromPrices(rows, { pricingGroupId: await getPricingGroupId() })) as ListRow[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is ListRow => r != null);
  const visibleIds = ordered.map((r) => r.id);

  const [details, definitions, memberPrices, session] = await Promise.all([
    readDetails(visibleIds).catch(() => new Map<number, DetailRow>()),
    readDefinitions().catch(() => []),
    getListingMemberPrices(ordered).catch(() => ({}) as Record<number, number>),
    getSession().catch(() => null),
  ]);
  // The guest rule depends on who is looking; the cart guard reads a missing session as a guest too.
  const viewer = { loggedIn: session != null };

  const products: CompareProduct[] = ordered.map((r) => {
    const price = cardPrice(r);
    const d = details.get(r.id);
    const kit = d ? readProductKit(d.metafields, CHANNEL_ID) : null;
    const buy = compareBuyButtons({
      shownPrice: price.sale ?? price.list,
      hidePrice: d?.hidePrice ?? false,
      restrictAddToCart: r.restrictAddToCart,
      restrictAddToQuote: r.restrictAddToQuote,
      purchasingDisabled: r.purchasingDisabled,
      inventoryTracking: d?.inventoryTracking ?? null,
      inventoryLevel: d?.inventoryLevel ?? null,
      backorderPolicy: d?.backorderPolicy ?? null,
      kit,
      // Any required question (the Zoey options imported for this storefront, default or not):
      // the column opens the product page instead, as Zoey's tile does.
      requiredQuestions: d ? tileRequiredQuestions({ metafields: d.metafields, channelId: CHANNEL_ID }) : null,
      // This storefront's Zoey rules (quote_only / cart_disabled / out_of_stock / guest quote-only).
      channelRules: d ? readChannelRules(d.metafields, CHANNEL_ID) : null,
      viewer,
    });
    return {
      id: r.id,
      name: r.name,
      href: `/products/${r.urlPath || r.id}`,
      sku: r.sku,
      brandName: r.brandName,
      imageUrl: r.thumbnailImage?.urlStandard || r.thumbnailImage?.urlThumbnail || null,
      descriptionShort: d?.descriptionShort ?? null,
      price,
      memberPrice: buy.priceHidden ? null : (memberPrices[r.id] ?? null),
      buttons: { cart: buy.cart, quote: buy.quote },
      answerRequired: buy.answerRequired,
      priceHidden: buy.priceHidden,
      isBundle: kit?.kind === "bundle",
      kitChoices: kit ? tileKitChoices(kit) : null,
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
