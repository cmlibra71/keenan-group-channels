"use client";
import * as React from "react";
import Link from "next/link";
import BuilderImage from "./builder-image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";
import {
  enquireHandler,
  masterLeafNatives,
  selectItemHandler,
  useAddToCartHandler,
  useAddToQuoteHandler,
} from "./master-leaves";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useFormHandlers, useFormConfirmations } from "./use-form-handlers";
import { brandNatives } from "./brand-natives";
import { categoryNatives } from "./category-natives";
import { ListingNavProvider, useListingNav } from "@/lib/listing-nav";
import { overlayPendingFilters, toggleListParam } from "@/lib/listing-pending";

/**
 * What the engine itself needs from a brand product — only enough to emit the
 * GA4 view_item_list payload. Each site's grid takes its own richer type; this
 * stays structural so the shared wrapper never imports a site component.
 */
export interface BrandGridProduct {
  id: number | string;
  sku?: string | null;
  name: string;
  brandName?: string | null;
  price: string;
  salePrice?: string | null;
}

// ============================================================================
// The brand page rendered from the 'brand' node template. The route owns the
// data (brand row, viewer-scoped + account-priced products, pricing ctx) and
// passes it here; the sealed "brand-products" native closes over it. Authored
// elements bind brand.* / total from the composed payload (SHARED composer —
// identical to the designer's sample).
// ============================================================================

type BuilderBrandPageProps = {
  tree: NodeTree;
  /** composeBrandPagePayload output ({ context, brand, products, total[, listing] }). */
  payload: object;
  /** Viewer-scoped, account-priced rows for the sealed grid. */
  products: BrandGridProduct[];
  pricing: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  memberPricingAvailable: boolean;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
  /**
   * The facets the price slider and attribute sections draw (category facet shape + this storefront's
   * rail configuration). Only for a tree that places a filter rail; absent → no rail natives.
   */
  listingFacets?: unknown;
};

/** A brand tree with a filter rail gets one listing navigation for the page, as a category page does,
 *  so the authored tick boxes, the price slider and the sort read the same pending change
 *  (lib/listing-nav.tsx). A tree without one renders exactly as before — no provider, no wrapper
 *  element (every Chefs Depot brand page). */
export function BuilderBrandPage(props: BuilderBrandPageProps) {
  if (!props.listingFacets) return <BrandPageTree {...props} />;
  return (
    <ListingNavProvider>
      <BrandPageTree {...props} />
    </ListingNavProvider>
  );
}

function BrandPageTree({
  tree,
  payload,
  products,
  pricing,
  memberPricingAvailable,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
  listingFacets,
}: BuilderBrandPageProps) {
  const router = useRouter();
  const nav = useListingNav();
  const searchParams = nav.params;
  const addToCart = useAddToCartHandler();
  const addToQuote = useAddToQuoteHandler();
  const { inclusive, pricesIncludeTax } = useGst();
  // While a filter change loads, the authored tick boxes and chips read the address the shopper just
  // asked for (a payload without `listing` passes through untouched).
  const livePayload = React.useMemo(() => {
    const gst = overlayLiveGst(payload, inclusive, pricesIncludeTax);
    return nav.pending ? overlayPendingFilters(gst, nav.params) : gst;
  }, [payload, inclusive, pricesIncludeTax, nav.pending, nav.params]);
  // masterLeafNatives is engine — every dependency it has exists on both
  // sites. Only the products grid is site-specific, so only that is delegated:
  // shared keys, each site's own look.
  const brandIdentity = (() => {
    const b = (payload as { brand?: Record<string, unknown> }).brand ?? {};
    return { slug: String(b.slug ?? b.id ?? ""), name: String(b.name ?? "") };
  })();

  const nativeComponents: NativeComponents = {
    ...masterLeafNatives(),
    // Brand identity comes from the composed payload so the site's grid can
    // emit the same GA4 list id/name the legacy page does.
    ...brandNatives({
      products,
      pricing,
      memberPricingAvailable,
      brandSlug: brandIdentity.slug,
      brandName: brandIdentity.name,
    }),
    // The filter rail's two data-driven leaves (price slider, attribute sections) — the category
    // page's own, fed this brand's facets. Only these two keys: neither is a master, so nothing
    // authored is shadowed, and a brand tree without a rail never places them.
    ...(listingFacets
      ? (() => {
          const ctx = (facets: unknown) =>
            categoryNatives({
              listing: {
                products: [],
                total: 0,
                shown: 0,
                facets,
                hasMore: false,
                nextPageHref: "",
                memberPricingAvailable,
                pricing,
                categoryName: brandIdentity.name,
                categorySlug: brandIdentity.slug,
              },
            });
          const natives = ctx(listingFacets);
          // A brand page's own filter list places each section in a slot among Category / Price /
          // Brand (Zoey's per-page order — services brandRail `slot`); the rail places one of these
          // per slot (prop `slot`). A section without a slot sits before Price.
          const BrandRailAttributes = (props: Record<string, unknown>) => {
            const slot = String(props.slot ?? "before_price");
            const f = listingFacets as { attributes?: Array<{ railSlot?: string }> };
            const Section = ctx({ ...f, attributes: (f.attributes ?? []).filter((a) => (a.railSlot ?? "before_price") === slot) })[
              "category-attribute-facets"
            ];
            return Section ? <Section /> : null;
          };
          return {
            "facet-price-slider": natives["facet-price-slider"],
            "category-attribute-facets": natives["category-attribute-facets"],
            "brand-rail-attributes": BrandRailAttributes,
          } as NativeComponents;
        })()
      : {}),
  };
  const formHandlers = useFormHandlers();
  // A form success panel shows its form's authored confirmation message when
  // one is set (card XBOxpQmd). Identity-returning when the page carries no
  // form, which is almost every page.
  const confirmed = useFormConfirmations(tree, components);
  const brandHandlers = React.useMemo(
    () => ({
      ...formHandlers,
      selectItem: selectItemHandler("brand_products", "Brand Products"),
      addToCart,
      addToQuote,
      enquire: enquireHandler(router),
      // The filter rail's Actions — the category page's, same URL semantics (comma-list params,
      // paging reset, replace without scroll). Unused on a brand tree without a rail.
      toggleFacet: (args: Record<string, unknown>) => {
        const param = String(args.param ?? "");
        const value = String(args.value ?? "");
        if (!param || !value) return { success: false, error: "Missing facet param/value" };
        // An old `?cat=` link selects categories the rail writes as `sub`: fold it in first, so the
        // box it ticked can be unticked and a second tick does not silently drop it.
        let base = searchParams;
        if (param === "sub" && searchParams.get("cat")) {
          const folded = new URLSearchParams(searchParams.toString());
          const merged = [...new Set([...(folded.get("sub") ?? "").split(","), ...(folded.get("cat") ?? "").split(",")].filter(Boolean))];
          folded.delete("cat");
          folded.set("sub", merged.join(","));
          base = folded;
        }
        // A price WINDOW (a Zoey band, `5000-5999.99`) is one choice, as Zoey's Price group was:
        // picking another replaces it, picking it again clears it. The coded bands stay a list.
        if (param === "price" && value.includes("-")) {
          const next = new URLSearchParams(base.toString());
          if (next.get("price") === value) next.delete("price");
          else next.set("price", value);
          next.delete("page");
          nav.replace(next);
          return { success: true };
        }
        nav.replace(toggleListParam(base, param, value));
        return { success: true };
      },
      clearFilters: () => {
        const nextParams = new URLSearchParams(searchParams.toString());
        for (const key of [...nextParams.keys()]) {
          if (key.startsWith("f_")) nextParams.delete(key);
        }
        ["sub", "cat", "brand", "price", "stock", "page"].forEach((p) => nextParams.delete(p));
        nav.replace(nextParams);
        return { success: true };
      },
      setSort: (args: Record<string, unknown>) => {
        const value = String(args.value ?? "");
        const next = new URLSearchParams(searchParams.toString());
        if (value) next.set("sort", value);
        else next.delete("sort");
        next.delete("page");
        nav.replace(next);
        return { success: true };
      },
    }),
    [formHandlers, addToCart, addToQuote, router, nav, searchParams]
  );
  return (
    <BuilderActionsProvider
      handlers={brandHandlers}
      navigate={(to) => router.push(to)}
    >
      <Ga4ViewItemList
        listId="brand_products"
        listName="Brand Products"
        items={products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index,
        }))}
      />
      <BuilderTree
        tree={confirmed.tree}
        payload={livePayload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={confirmed.components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={BuilderImage}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
