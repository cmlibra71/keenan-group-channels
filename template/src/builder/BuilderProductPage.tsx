"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BuilderImage from "./builder-image";
import type { NodeTree, ProductPagePayload } from "@keenan/services/builder";
import { componentRendersFor } from "@keenan/services/component-renders";
import {
  ProductPurchaseProvider,
  useProductPurchase,
  useProductPageScope,
  useProductPageHandlers,
  enrichProductPayload,
  type PurchaseProduct,
} from "@keenan/services/product-page";
import { addToCart } from "@/lib/actions/cart";
import type { AddonSelectionInput, ProductAddons } from "@keenan/services/product-addons";
import type { GiftCardSelectionInput } from "@keenan/services/gift-card";
import { missingAnswerSentence, tileRefusalDestination } from "@/lib/product/addon-panel";
import { COMBINATION_UNAVAILABLE_TEXT } from "@/components/product/ProductCombinationNotice";
import { addToQuote } from "@/lib/actions/quote";
import { submitReview } from "@/lib/actions/reviews";
import { useGst } from "@/lib/gst";
import { overlayLiveGst } from "./live-gst";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { FINANCE_FROM_REQUIRED_OPTION, KEEP_TEXT_COLOR } from "@/lib/zoey-parity-site";
import { BuilderTree, type NativeComponents } from "@keenan/services/builder-react";
import { BuilderActionsProvider } from "@keenan/services/builder-react";
import { useFormHandlers, useFormConfirmations } from "./use-form-handlers";
import { productNatives } from "./product-natives";
import { productFinanceOffer, productFinanceScope, requiredOptionFinancePrice } from "@/lib/finance/product-finance";
import { quoteExtrasGroups } from "@keenan/services/product-addons";
import { useFinanceRates } from "@/lib/finance/finance-rates-context";
import { barQuantity, KIT_ADD_TO_QUOTE_EVENT, type KitAddToQuoteDetail } from "@/lib/kit-bar-event";

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
    async (
      pid: number,
      variantId: number | null,
      quantity: number,
      // The shopper's ticked extras (card 0CDcCYmO). Keys only — every price is read
      // back from the product's own definition inside the action.
      addons?: AddonSelectionInput
    ) => {
      const res = await addToCart(pid, variantId, quantity, addons);
      if (res && "cartCount" in res && typeof res.cartCount === "number") {
        setCartCount(res.cartCount);
        open("cart");
      }
      // A related-rail TILE posted no configuration; if that product asks a required
      // question (Gas Type — card tkvntxsq) the refusal carries its page, and the shopper is
      // taken there to answer it. This page's own buy row posts one, so gets no destination.
      const destination = tileRefusalDestination(res);
      if (destination) router.push(destination);
      return res;
    },
    [setCartCount, open, router]
  );
  const countingAddToQuote = React.useCallback(
    async (
      pid: number,
      variantId: number | null,
      // The shopper's ticked extras (card 0CDcCYmO). A quote line is priced by a rep, so
      // these move no money here — they ride the line as the record of what was asked for,
      // the same way a bundle build does.
      addons?: AddonSelectionInput,
      // IK gift cards (Zoey parity): the amount and recipient / sender details — re-validated by
      // the action against the product's own configuration.
      giftCard?: GiftCardSelectionInput,
      // The Qty box — sent by the bridge with a gift card only (how many cards).
      quantity?: number
    ) => {
      const res = await addToQuote(pid, variantId, null, addons, giftCard ? (quantity ?? null) : null, giftCard ?? null);
      if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
        setQuoteCount(res.quoteCount);
        open("quote");
      }
      const destination = tileRefusalDestination(res);
      if (destination) router.push(destination);
      return res;
    },
    [setQuoteCount, open, router]
  );
  // Configurable product with nothing chosen yet: the quote CTA stays live and
  // this prompt names the option still to pick, instead of the click doing
  // nothing at all (parity with the old coded button's disabled state, plus an
  // actual explanation).
  const [optionsPrompt, setOptionsPrompt] = React.useState<string | null>(null);
  // The VERB has to fit the control: you choose a hopper and you fill in an instruction, and
  // this dialog is what a shopper reads instead of the server's own refusal, so the two must
  // agree (card kyMjCmAw). `missingAnswerSentence` splits it the same way and in the same order
  // both buy actions do.
  const promptAddons = (payload.product as { addons?: ProductAddons | null } | undefined)?.addons;
  const onOptionsRequired = React.useCallback(
    (missing: string[]) => {
      setOptionsPrompt(
        // Nothing is missing and the buy still refused: that is the UNMADE COMBINATION, and
        // this dialog must say what the page already says beside the buy row. ONE string,
        // quoted from the notice itself — a shopper who reads the sentence on the page and a
        // different one in the dialog learns two facts where there is one (card VNh9DdYd).
        missingAnswerSentence(promptAddons ?? null, missing, "quote") ??
          COMBINATION_UNAVAILABLE_TEXT
      );
    },
    [promptAddons]
  );
  const handlers = useProductPageHandlers({
    productId,
    addToCart: countingAddToCart,
    addToQuote: countingAddToQuote,
    onOptionsRequired,
  });
  const baseScope = useProductPageScope(payload, { inclusive, pricesIncludeTax });
  // The weekly-rent offer as `purchase.finance*` (IK hidden-conditionals C8): the SAME call, on the
  // same inputs, as the sealed SilverChefPanel, so a template that authors the panel quotes the
  // same rent. Additive — a tree that never reads these renders exactly as before.
  const financeRates = useFinanceRates();
  const scope = React.useMemo(() => {
    // A $0 quote-only product whose required Zoey option carries the price (29797): quote the rent
    // off that option, whose price the quote-extras box already prints. Per-site switch.
    const shownPrice = purchase.financeDisplayPrice ?? purchase.displayPrice;
    const optionPrice =
      FINANCE_FROM_REQUIRED_OPTION && purchase.quoteExtrasShown && !(shownPrice > 0)
        ? requiredOptionFinancePrice(quoteExtrasGroups(purchase.product.addons ?? null), purchase.selectedAddons)
        : 0;
    const offer = productFinanceOffer({
      price: optionPrice > 0
        ? { displayPrice: optionPrice, displaySalePrice: null, memberPrice: null }
        : {
            displayPrice: shownPrice,
            displaySalePrice:
              purchase.financeDisplaySalePrice !== undefined ? purchase.financeDisplaySalePrice : purchase.displaySalePrice,
            memberPrice: purchase.financeMemberPrice !== undefined ? purchase.financeMemberPrice : purchase.activeMemberPrice,
          },
      sku: purchase.activeVariant?.sku ?? purchase.product.sku,
      brand: purchase.product.brandName ?? null,
      pricesIncludeTax,
      rates: financeRates,
    });
    return { ...baseScope, purchase: { ...baseScope.purchase, ...productFinanceScope(offer) } };
  }, [baseScope, purchase, pricesIncludeTax, financeRates]);
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
  // Does THIS template draw the extras panel for this product? Answered from the rendered tree
  // itself — the same Show-if chain the renderer walks, on the same payload + scope — so the buy
  // row's "no dead button" fact (`purchase.requiredQuestionsUnanswerable`) follows whatever the
  // author did with the panel: moved, re-conditioned or deleted (IK hidden-conditionals batch 3,
  // judge on batch 2). Deterministic, so server and browser agree on first paint.
  const pageScope = React.useMemo(() => {
    const drawn = componentRendersFor(
      confirmed.tree as NodeTree,
      confirmed.components as Record<string, NodeTree>,
      "product-addons",
      livePayload,
      scope
    );
    const p = scope.purchase as Record<string, unknown>;
    return {
      ...scope,
      purchase: { ...p, requiredQuestionsUnanswerable: p.requiredQuestionsWithoutDefault === true && !drawn },
    };
  }, [confirmed, livePayload, scope]);
  const actionHandlers = React.useMemo(
    () => ({
      ...handlers,
      ...formHandlers,
      // Zoey's fixed "Price as configured" bar on a bundle: its ADD TO QUOTE adds the kit's picks
      // (the kit native answers the event) at the bar's quantity. Resolves for the bar's toast;
      // a page with no kit native answers nothing, so the press says so rather than hanging.
      addBundleToQuote: (args?: Record<string, unknown>) =>
        new Promise<{ success?: boolean; error?: string }>((resolve) => {
          const detail: KitAddToQuoteDetail = { productId, quantity: barQuantity(args?.quantity), handled: false, resolve };
          // dispatchEvent runs listeners synchronously, so `handled` is known on return.
          window.dispatchEvent(new CustomEvent(KIT_ADD_TO_QUOTE_EVENT, { detail }));
          if (!detail.handled) resolve({ error: "This product has no configuration to add." });
        }),
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
          // The sealed panel carries the honeypot; an authored form that adds
          // one gets the same trap for free (card qxVqy5Dn).
          honeypot: str("website"),
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
        scope={pageScope}
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
            {/* One heading for every reason this dialog opens. "Choose an option" was written
                for a variant picker and reads wrong above "Please fill in Instructions" — a
                heading that argues with its own sentence (card kyMjCmAw). */}
            <p className="mb-1 text-base font-semibold text-text-primary">One more thing</p>
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
  plainTextLineBreaks = false,
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  /** Route-owned data for this site's sealed product natives. */
  nativeData?: Record<string, unknown>;
  /** The site's `product_copy_display.plain_text_line_breaks` setting (portal → Storefront Listings):
   *  plain-text descriptions keep their line breaks as Zoey's nl2br printed them. Absent = off. */
  plainTextLineBreaks?: boolean;
}) {
  // The BRAND rides into the purchase scope because the sealed SilverChef panel
  // has to know whether this is a SKOPE machine, and since Steve widened that
  // test (card 6f47rFeT, 2026-08-19) the brand answers it for the 76 SKOPE
  // fridges whose SKU does not. The payload already carries the brand slice, so
  // this costs no query — it only has to reach the provider.
  //
  // A kit scoped to THIS storefront may be quote only (`channel_kits[<channel>].quote_only` — a
  // bundle Zoey sells by quote only, IK parity 2026-09-28). The route parsed the kit once into
  // `nativeData.kit`; its `quoteOnly` switches Add to Cart off exactly as `restrict_add_to_cart`
  // does. Read defensively: a site whose kit reader predates it simply has no such flag.
  const kitQuoteOnly = (nativeData?.kit as { quoteOnly?: unknown } | null | undefined)?.quoteOnly === true;
  const product = React.useMemo(
    () => ({
      ...(payload.product as unknown as PurchaseProduct),
      brandName: payload.brand?.name ?? null,
      ...(kitQuoteOnly ? { restrictAddToCart: true } : {}),
    }),
    [payload, kitQuoteOnly]
  );
  const enriched = React.useMemo(() => enrichProductPayload(payload, { sanitizeHtml, keepTextColor: KEEP_TEXT_COLOR, plainTextLineBreaks }), [payload, plainTextLineBreaks]);
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
