"use client";

import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import type { CompareProduct } from "@/lib/compare/compare.server";
import { MISSING_VALUE, type CompareRow } from "@/lib/compare/compare-rows";
import { useCompareListOrNull } from "@/lib/compare/use-compare-list";
import { Price } from "@/components/ui/Price";
import { RichContent } from "@/components/content/RichContent";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { AddToQuoteButton } from "@/components/product/AddToQuoteButton";
import { ClearCompare, PrintCompare, PruneCompare, RemoveFromCompare } from "./CompareControls";

// The compare table. The server resolves every column (per-viewer prices, visibility); this
// client view then shows only the columns still in the visitor's cookie, so Remove and Clear
// take effect the instant they are pressed — no server round trip, nothing re-fetched. Until the
// cookie has been read (the server render, hydration) the server's own columns are shown.

function PriceCell({ p }: { p: CompareProduct }) {
  const { list, sale, from } = p.price;
  // A hidden price (`hide_price`) is masked to 0 on the product page; the column follows it.
  if (p.priceHidden || list <= 0) return <span className="font-semibold text-zinc-900">Call for Price</span>;
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
  // options are chosen — the old site's tiles said VIEW DETAILS for exactly these. So is a
  // product asking a required question with no default (Zoey's tile shows View Details alone).
  if (p.price.from || p.answerRequired) {
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
      {p.buttons.quote && (
        <AddToQuoteButton
          productId={p.id}
          // A bundle's quote carries the kit's marked defaults, as its listing tile does; a kit
          // that cannot be answered without the page is refused there and the shopper sent to it.
          kitChoices={p.isBundle ? p.kitChoices : null}
          label={p.isBundle ? "Add to Quote — request pricing" : undefined}
        />
      )}
    </div>
  );
}

export function CompareView({ products: all, rows: allRows }: { products: CompareProduct[]; rows: CompareRow[] }) {
  const list = useCompareListOrNull();
  const keep = all.map((p) => list == null || list.includes(p.id));
  const products = all.filter((_, i) => keep[i]);
  // A row is kept only while a SHOWN product carries a value in it — Zoey's rule, re-applied
  // after a removal so a row that only the removed product had goes with it.
  const rows = allRows
    .map((r) => ({ ...r, values: r.values.filter((_, i) => keep[i]) }))
    .filter((r) => r.values.some((v) => v !== MISSING_VALUE));

  const labelCell = "sticky left-0 z-10 w-28 min-w-28 sm:w-36 sm:min-w-36 bg-white py-3 pr-4 text-left align-top text-xs font-semibold uppercase tracking-wider text-zinc-500";
  const valueCell = "min-w-48 sm:min-w-56 py-3 pr-6 align-top text-sm text-zinc-800";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PruneCompare shownIds={all.map((p) => p.id)} />
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
