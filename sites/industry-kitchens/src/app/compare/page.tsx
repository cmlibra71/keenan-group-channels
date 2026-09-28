import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COMPARE_COOKIE, parseCompareList } from "@/lib/compare/compare-list";
import { loadCompareData } from "@/lib/compare/compare.server";
import { CompareView } from "@/components/compare/CompareView";

// ============================================================================
// Compare Products — Industry Kitchens only (IK parity plan decision 12, root
// cause `compare-feature`). Chefs Depot has no such page and no control.
//
// The old site's list (`/catalog/product_compare/index/`, opened as a popup from
// "View Compare") was a table: one column per product — photo and name at the
// top — and one row per comparable attribute: Description, Short Description,
// SKU, the attributes, Brand, then the price and ADD TO BASKET. This page is the
// same table on the site's own chrome. Two deliberate differences: the long
// Description row is left out (it runs to thousands of words per product and
// buries the comparison — the name links to it), and each column has a remove
// control plus a "Clear all", which the old popup did not offer.
//
// Server-rendered from the visitor's compare cookie, per request: prices are per
// viewer. Never indexed.
// ============================================================================

export const metadata: Metadata = {
  title: "Compare Products",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const cookieStore = await cookies();
  const ids = parseCompareList(cookieStore.get(COMPARE_COOKIE)?.value);
  const { products, rows } = await loadCompareData(ids);
  return <CompareView products={products} rows={rows} />;
}
