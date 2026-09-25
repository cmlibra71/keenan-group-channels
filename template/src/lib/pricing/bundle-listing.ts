import "server-only";
import { cache } from "react";
import { getCommerceClient } from "@keenan/services";
import {
  defaultBuildTotal,
  memberPriceMapWithKit,
  readProductKit,
  withKitPrice,
} from "@/lib/product-kit";
import { priceKitComponents } from "@/lib/pricing/kit-components";

// ============================================================================
// A BUNDLE's price on a listing tile, a search hit and a rail (card Tc5ekvD6).
//
// The product page prices a bundle live: its own price plus the build it opens on
// (`defaultKitSelection`), each part at THIS shopper's cart price. A tile that printed the
// bundle's own price instead would disagree with the page the moment it is clicked — the Hoshizaki
// KMD-270AB would read $5,716.74 on the tile and about $7,189 on its page, and a $0 bundle would
// read "quote only" on the tile while its page sells it (`sf-catalog-browse`, "a tile that says one
// thing and the product page another"). So every listing row funnels through here, straight after
// the account prices (`applyAccountPrices`), and a bundle row carries exactly the headline its page
// first paints: the same `priceKitComponents`, the same default build, the same `withKitPrice`.
//
// Per request and read-only: the shared caches the rows came from are never written, and a row
// that is not a bundle is returned by identity. Cost: ONE indexed read per listing to ask which
// rows are kits (almost never any), then the part prices, memoised for the request so a page with
// thirteen Rational stacks sharing one stand prices that stand once.
// ============================================================================

/** Which of these products carry a kit, with the kit blob — one indexed read per listing. */
const kitMetafieldsFor = cache(async (key: string): Promise<Array<{ id: number; metafields: unknown }>> => {
  const ids = key
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return [];
  const sql = getCommerceClient();
  if (!sql) return [];
  const rows = await sql<Array<{ id: number; metafields: unknown }>>`
    SELECT id, metafields
      FROM products
     WHERE id = ANY(${ids})
       AND metafields -> 'kit' IS NOT NULL`;
  return rows.map((r) => ({ id: Number(r.id), metafields: r.metafields }));
});

/** One memo per request: product id -> its default build's total (null = none to add). */
const requestTotals = cache(() => new Map<number, Promise<number | null>>());

/**
 * The default-build total of every BUNDLE among these products, for this shopper, ex GST. A
 * product that is not a bundle, or whose opening build has a part with no price online here, is
 * absent — the page adds nothing for it either.
 */
export async function bundleListingTotals(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (unique.length === 0) return out;
  let rows: Array<{ id: number; metafields: unknown }>;
  try {
    rows = await kitMetafieldsFor(unique.join(","));
  } catch {
    return out; // a listing never breaks over a bundle price
  }
  if (rows.length === 0) return out;
  const memo = requestTotals();
  await Promise.all(
    rows.map(async ({ id, metafields }) => {
      let pending = memo.get(id);
      if (!pending) {
        pending = (async () => {
          const kit = readProductKit(metafields);
          if (kit?.kind !== "bundle") return null;
          return defaultBuildTotal(kit, await priceKitComponents(kit));
        })().catch(() => null);
        memo.set(id, pending);
      }
      const total = await pending;
      if (total != null && total > 0) out.set(id, total);
    })
  );
  return out;
}

type ListingRow = {
  id: number;
  price?: string | null;
  salePrice?: string | null;
  hidePrice?: boolean | null;
  hide_price?: boolean | null;
  variants?: Array<{ price?: string | null; salePrice?: string | null }>;
};

/** Listing rows with each bundle priced at the build its page opens on. Same array when there is
 *  no bundle among them. A row whose price staff hid gets nothing added — a hidden price must
 *  never be republished as a sum. */
export async function withBundleListingPrices<T extends { id: number }[]>(rows: T): Promise<T> {
  if (rows.length === 0) return rows;
  const totals = await bundleListingTotals(rows.map((r) => r.id));
  if (totals.size === 0) return rows;
  return rows.map((row) => {
    const r = row as ListingRow;
    const add = totals.get(r.id);
    if (add == null || r.hidePrice === true || r.hide_price === true) return row;
    return withKitPrice({ ...r, price: r.price ?? "0" } as ListingRow & { price: string }, add);
  }) as unknown as T;
}

/** A listing's member / contract price map with each bundle's opening build on top — the page
 *  does the same to its member price (`memberPriceWithKit`). */
export async function withBundleMemberPrices(
  map: Record<number, number>,
  ids: number[]
): Promise<Record<number, number>> {
  const bundleIds = ids.filter((id) => map[id] != null);
  if (bundleIds.length === 0) return map;
  const totals = await bundleListingTotals(bundleIds);
  if (totals.size === 0) return map;
  const out = { ...map };
  for (const [id, add] of totals) {
    const priced = memberPriceMapWithKit({ [id]: out[id] }, add)[id];
    if (priced != null) out[id] = priced;
  }
  return out;
}
