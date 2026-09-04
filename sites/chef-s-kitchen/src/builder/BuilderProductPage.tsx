"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BuilderImage from "./builder-image";
import type { NodeTree, ProductPagePayload } from "@keenan/services/builder";
import {
  ProductPurchaseProvider,
  useProductPurchase,
  useProductPageScope,
  useProductPageHandlers,
  enrichProductPayload,
  type PurchaseProduct,
} from "@keenan/services/product-page";
import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { submitReview } from "@/lib/actions/reviews";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { BuilderTree, type NativeComponents } from "@keenan/services/builder-react";
import { BuilderActionsProvider } from "@keenan/services/builder-react";
import { useFormHandlers, useFormConfirmations } from "./use-form-handlers";
import { productNatives } from "./product-natives";

// ============================================================================
// The product page rendered from a node tree. Thin wrapper over the SHARED
// presentation layer (@keenan/services/product-page) so the storefront and the
// portal editor render identically. This file only supplies the storefront's
// framework-specific bits: the real server actions, the native gallery/back
// components, Next <Link>/<Image>, and sanitizeHtml.
// ============================================================================

function ActionsBridge({
  productId,
  tree,
  payload,
  namedStyles,
  jsFunctions,
  callResults,
  components,
  nativeData,
}: {
  productId: number;
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  /** Route-owned data this site's sealed product natives need. Opaque here;
   *  each site's product-natives knows its own shape. */
  nativeData?: Record<string, unknown>;
}) {
  const purchase = useProductPurchase();
  const router = useRouter();
  const { inclusive, pricesIncludeTax } = useGst();
  // Wrap the site actions so the returned fresh counts reach the header badges
  // (the item mutations no longer trigger a route re-render) and a successful
  // add pops the matching panel out — parity with AddToCart/AddToQuoteButton.
  const { setCartCount, setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();
  const countingAddToCart = React.useCallback(
    async (pid: number, variantId: number | null, quantity: number) => {
      const res = await addToCart(pid, variantId, quantity);
      if (res && "cartCount" in res && typeof res.cartCount === "number") {
        setCartCount(res.cartCount);
        open("cart");
      }
      return res;
    },
    [setCartCount, open]
  );
  const countingAddToQuote = React.useCallback(
    async (pid: number, variantId: number | null) => {
      const res = await addToQuote(pid, variantId);
      if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
        setQuoteCount(res.quoteCount);
        open("quote");
      }
      return res;
    },
    [setQuoteCount, open]
  );
  // Configurable product with nothing chosen yet: the quote CTA stays live and
  // this prompt names the option still to pick, instead of the click doing
  // nothing at all (parity with the old coded button's disabled state, plus an
  // actual explanation).
  const [optionsPrompt, setOptionsPrompt] = React.useState<string | null>(null);
  const onOptionsRequired = React.useCallback((missing: string[]) => {
    const names = missing.filter(Boolean);
    setOptionsPrompt(
      names.length
        ? `Please choose ${names.join(" and ")} before adding this to your quote.`
        : "That combination isn't available — please choose a different configuration."
    );
  }, []);
  const handlers = useProductPageHandlers({
    productId,
    addToCart: countingAddToCart,
    addToQuote: countingAddToQuote,
    onOptionsRequired,
  });
  const scope = useProductPageScope(payload, { inclusive, pricesIncludeTax });
  // Overlay the live GST toggle onto context.gst so any card-rail price-block
  // masters (related products) resolve ex/inc labels from the live state.
  const livePayload = React.useMemo(
    () => overlayLiveGst(payload, inclusive, pricesIncludeTax),
    [payload, inclusive, pricesIncludeTax]
  );

  // Coded (non-exploded) components slotted in by key. WHICH ones a site seals
  // is the site's business — both sites now seal only widgets that carry their
  // own behaviour or data (the gallery either side, plus IK's warranty
  // directory) — so they come from the per-site ./product-natives under shared
  // KEYS.
  //
  // Card 0CDcCYmO. This guard used to be the whole reason a variation never
  // changed the picture: EVERY one of the 1,480 legacy variant rows holds a
  // relative Zoey media PATH rather than a URL, so the test below rejected all
  // of them and the gallery silently kept the product images while the price,
  // the SKU and the option labels all switched. Resolution now happens once,
  // server-side, in `resolveVariantImageUrl` (@keenan/services), so what
  // arrives here is either an absolute https URL or null. The test stays as a
  // last line of defence — an authored payload is data, and a relative value
  // reaching the gallery would 403 the allowlisted proxy and render as a
  // broken-image glyph, which is worse than falling back to the product
  // images.
  const variantImg =
    purchase.variantImageUrl && /^https:\/\//i.test(purchase.variantImageUrl)
      ? purchase.variantImageUrl
      : null;
  // Memoised on the three values the natives actually close over. Without this
  // every native is a FRESH component function on every render, which is a new
  // component TYPE to React, so the gallery unmounts and remounts whenever
  // anything on the page changes — losing its zoom state and re-running its
  // mount work. It matters here because the gallery is exactly the leaf this
  // card makes stateful about the chosen variation. (Card 0CDcCYmO.)
  const nativeComponents: NativeComponents = React.useMemo(
    () =>
      productNatives({
        payload: payload as unknown as Record<string, unknown>,
        variantImageUrl: variantImg,
        data: nativeData ?? {},
      }),
    [payload, variantImg, nativeData]
  );

  // goBack drives the exploded back-to-products master's click Action — mirrors
  // the old BackButton native (history-back with a /products fallback).
  const formHandlers = useFormHandlers();
  // A form success panel shows its form's authored confirmation message when
  // one is set (card XBOxpQmd). Identity-returning when the page carries no
  // form, which is almost every page.
  const confirmed = useFormConfirmations(tree, components);
  const actionHandlers = React.useMemo(
    () => ({
      ...handlers,
      ...formHandlers,
      goBack: (args?: Record<string, unknown>) => {
        if (window.history.length > 1) router.back();
        else router.push(String(args?.fallbackHref ?? "/products"));
      },
      // The authored review form's submit. `@form` hands over the live
      // FormData, so the rating arrives as the hidden input the star picker
      // writes; everything else is the same server action the coded form
      // called. The result is returned verbatim — {error} is what turns into
      // submit.error on the tree, {success} into the thank-you panel.
      submitReview: async (args?: Record<string, unknown>) => {
        const form = args?.form;
        if (!(form instanceof FormData)) return { error: "Couldn't read the form." };
        const str = (k: string) => String(form.get(k) ?? "").trim();
        return submitReview(Number(args?.productId ?? productId), {
          rating: Number(form.get("rating") ?? 0),
          title: str("title"),
          text: str("text"),
          authorName: str("authorName"),
        });
      },
      enquire: (args?: Record<string, unknown>) => {
        const pid = args?.product_id ?? productId;
        // The enquiry form is the CMS page /pages/contact — there is no
        // /contact route, so the old path 404'd every Enquire button.
        router.push(`/pages/contact?product=${pid}`);
      },
    }),
    [handlers, router, productId]
  );

  return (
    <BuilderActionsProvider handlers={actionHandlers} navigate={(to) => router.push(to)}>
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
        scope={scope}
      />
      {optionsPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOptionsPrompt(null)}
        >
          <div
            className="w-full max-w-sm rounded-md bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-semibold text-text-primary">Choose an option</p>
            <p className="mb-4 text-sm text-text-secondary">{optionsPrompt}</p>
            <button className="btn-primary" type="button" autoFocus onClick={() => setOptionsPrompt(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </BuilderActionsProvider>
  );
}

export function BuilderProductPage({
  tree,
  payload,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  nativeData,
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  /** Route-owned data for this site's sealed product natives. */
  nativeData?: Record<string, unknown>;
}) {
  // The BRAND rides into the purchase scope because the sealed SilverChef panel
  // has to know whether this is a SKOPE machine, and since Steve widened that
  // test (card 6f47rFeT, 2026-08-19) the brand answers it for the 76 SKOPE
  // fridges whose SKU does not. The payload already carries the brand slice, so
  // this costs no query — it only has to reach the provider.
  const product = React.useMemo(
    () => ({
      ...(payload.product as unknown as PurchaseProduct),
      brandName: payload.brand?.name ?? null,
    }),
    [payload]
  );
  const enriched = React.useMemo(() => enrichProductPayload(payload, { sanitizeHtml }), [payload]);
  return (
    <ProductPurchaseProvider
      product={product}
      memberPrice={payload.pricing.memberPrice}
      memberPriceMap={payload.pricing.memberPriceMap}
      isMember={payload.pricing.isMember}
      // Non-members have no member price, so the join strip's condition is false
      // for them — this is what keeps the funnel on the page.
      memberSavingsPct={payload.pricing.memberSavingsPct ?? 0}
      accountPricing={!payload.pricing.isMember && payload.pricing.memberPrice != null}
      membershipTeaser={payload.pricing.membershipTeaser}
    >
      <ActionsBridge productId={payload.product.id} tree={tree} payload={enriched} namedStyles={namedStyles} components={components} jsFunctions={jsFunctions} callResults={callResults} nativeData={nativeData} />
    </ProductPurchaseProvider>
  );
}
