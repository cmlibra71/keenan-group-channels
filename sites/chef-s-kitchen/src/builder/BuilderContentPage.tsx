"use client";
import * as React from "react";
import Link from "next/link";
import BuilderImage, { HiDpiImagesContext } from "./builder-image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";
import { siteRenderPolicy } from "./site-render-policy";
import { ResponsiveDetails } from "./responsive-details";
import { CarouselEnhance } from "./carousel-enhance";
import { useFormHandlers, useFormConfirmations } from "./use-form-handlers";
import { contentNatives } from "./content-natives";
import { useAddToCartHandler, useAddToQuoteHandler } from "./master-leaves";

// ============================================================================
// A CONTENT page rendered from a node tree (Site Builder) — the generic,
// product-free sibling of BuilderProductPage. Used by /pages/[slug] for
// one-off pages AND the shared policy layout. The payload is composed by the
// route via the SHARED composers (@keenan/services page-payloads) — the same
// functions the portal designer samples with, so bindings resolve identically.
// Cart/quote Actions are wired only where the site loads page product lists
// (site policy pageLists — WP2-a: a list's tiles add to basket / quote as on a
// category page); elsewhere they stay no-ops. Internal links navigate through
// next/link.
// ============================================================================

export function BuilderContentPage({
  tree,
  payload,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  /** Composed page payload ({ context, page } — composeContentPagePayload). */
  payload: object;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
}) {
  const router = useRouter();
  // The site supplies its own sealed leaves under shared KEYS — that is the
  // seam. This file is engine and is identical on every site; only
  // ./content-natives differs, so one site's components never leak into
  // another's build.
  const nativeComponents: NativeComponents = contentNatives();
  // Content/landing pages are exactly where enquiry forms go, and they
  // registered NO actions at all until now.
  const formHandlers = useFormHandlers();
  // A form success panel shows its form's authored confirmation message when
  // one is set (card XBOxpQmd). Identity-returning when the page carries no
  // form, which is almost every page.
  const confirmed = useFormConfirmations(tree, components);
  const addToCart = useAddToCartHandler();
  const addToQuote = useAddToQuoteHandler();
  const handlers = siteRenderPolicy.pageLists ? { ...formHandlers, addToCart, addToQuote } : formHandlers;
  return (
    <HiDpiImagesContext.Provider value={!!siteRenderPolicy.hiDpiImages}>
    <BuilderActionsProvider handlers={handlers} navigate={(to) => router.push(to)}>
      <BuilderTree
        formPolicy={siteRenderPolicy.formPolicy}
        embedPolicy={siteRenderPolicy.embedPolicy}
        tree={confirmed.tree}
        payload={payload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={confirmed.components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={BuilderImage}
        draft={draft}
      />
      {siteRenderPolicy.responsiveDetails ? <ResponsiveDetails /> : null}
      {siteRenderPolicy.carousels ? <CarouselEnhance /> : null}
    </BuilderActionsProvider>
    </HiDpiImagesContext.Provider>
  );
}
