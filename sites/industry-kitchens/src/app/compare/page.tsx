import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { Package } from "lucide-react";
import { COMPARE_COOKIE, parseCompareList } from "@/lib/compare/compare-list";
import { loadCompareData, type CompareProduct } from "@/lib/compare/compare.server";
import { Price } from "@/components/ui/Price";
import { RichContent } from "@/components/content/RichContent";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { AddToQuoteButton } from "@/components/product/AddToQuoteButton";
import {
  ClearCompare,
  PrintCompare,
  PruneCompare,
  RemoveFromCompare,
} from "@/components/compare/CompareControls";

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

function PriceCell({ p }: { p: CompareProduct }) {
  const { list, sale, from } = p.price;
  if (list <= 0) return <span className="font-semibold text-zinc-900">Call for Price</span>;
  const shown = sale ?? list;
  if (p.memberPrice != null && p.memberPrice < shown) {
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <Price amount={p.memberPrice} gst className="font-semibold text-green-700" />
        <span className="text-sm text-zinc-400 line-through">
          <Price amount={shown} gst />
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {from && <span className="text-xs text-zinc-500">Starting From:</span>}
      {sale != null ? (
        <>
          <span className="text-sm text-zinc-400 line-through">
            <Price amount={list} gst />
          </span>
          <Price amount={sale} gst className="font-semibold text-red-600" />
        </>
      ) : (
        <Price amount={list} gst className="font-semibold text-zinc-900" />
      )}
    </div>
  );
}

function BuyCell({ p }: { p: CompareProduct }) {
  // A configurable product (priced "Starting From") is bought on its own page, where its
  // options are chosen — the old site's tiles said VIEW DETAILS for exactly these.
  if (p.price.from) {
    return (
      <Link
        href={p.href}
        className="block w-full rounded-lg bg-zinc-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-zinc-800"
      >
        View Details
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {p.buttons.cart && (
        <AddToCartButton
          productId={p.id}
          size="sm"
          productName={p.name}
          sku={p.sku}
          brandName={p.brandName ?? undefined}
          price={p.price.sale ?? p.price.list}
        />
      )}
      {p.buttons.quote && <AddToQuoteButton productId={p.id} />}
    </div>
  );
}

export default async function ComparePage() {
  const cookieStore = await cookies();
  const ids = parseCompareList(cookieStore.get(COMPARE_COOKIE)?.value);
  const { products, rows } = await loadCompareData(ids);

  const labelCell = "sticky left-0 z-10 w-28 min-w-28 sm:w-36 sm:min-w-36 bg-white py-3 pr-4 text-left align-top text-xs font-semibold uppercase tracking-wider text-zinc-500";
  const valueCell = "min-w-48 sm:min-w-56 py-3 pr-6 align-top text-sm text-zinc-800";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PruneCompare shownIds={products.map((p) => p.id)} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Compare Products</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {products.length === 0
              ? "Your compare list is empty."
              : `${products.length} ${products.length === 1 ? "product" : "products"} side by side.`}
          </p>
        </div>
        {products.length > 0 && (
          <div className="flex gap-2">
            <PrintCompare />
            <ClearCompare />
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 px-6 py-16 text-center">
          <p className="text-zinc-600">
            Press <strong>Add to Compare</strong> on any product page to line products up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto" data-testid="compare-table">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className={labelCell}>
                  <span className="sr-only">Attribute</span>
                </th>
                {products.map((p) => (
                  <th key={p.id} scope="col" className={`${valueCell} pb-4 text-left font-normal`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={p.href} className="group block flex-1">
                        <div className="relative mb-3 aspect-square w-40 max-w-full overflow-hidden rounded-lg bg-zinc-100">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill sizes="160px" className="object-contain" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300">
                              <Package className="h-10 w-10" />
                            </div>
                          )}
                        </div>
                        <span className="block text-base font-semibold text-zinc-900 group-hover:text-zinc-600">
                          {p.name}
                        </span>
                      </Link>
                      <RemoveFromCompare productId={p.id} name={p.name} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {products.some((p) => p.descriptionShort) && (
                <tr>
                  <th scope="row" className={labelCell}>Short Description</th>
                  {products.map((p) => (
                    <td key={p.id} className={valueCell}>
                      {p.descriptionShort ? (
                        <RichContent html={p.descriptionShort} stripStyles className="prose prose-sm text-sm text-zinc-600" />
                      ) : (
                        "N/A"
                      )}
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <th scope="row" className={labelCell}>SKU</th>
                {products.map((p) => (
                  <td key={p.id} className={valueCell}>{p.sku || "N/A"}</td>
                ))}
              </tr>
              {rows.map((row) => (
                <tr key={row.code} data-testid={`compare-row-${row.code}`}>
                  <th scope="row" className={labelCell}>{row.label}</th>
                  {row.values.map((v, i) => (
                    <td key={products[i].id} className={valueCell}>{v}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className={labelCell}>Brand</th>
                {products.map((p) => (
                  <td key={p.id} className={valueCell}>{p.brandName || "N/A"}</td>
                ))}
              </tr>
              <tr>
                <th scope="row" className={labelCell}>
                  <span className="sr-only">Price and buy</span>
                </th>
                {products.map((p) => (
                  <td key={p.id} className={valueCell}>
                    <div className="mb-3">
                      <PriceCell p={p} />
                    </div>
                    <div className="max-w-56 print:hidden">
                      <BuyCell p={p} />
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
