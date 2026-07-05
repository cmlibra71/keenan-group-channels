import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Phase-5: the CD Product Page as a FULL-PARITY node tree, transcribed from the
// live page's markup (builder-snapshots baselines). Sections: breadcrumbs,
// two-col overview (gallery | sticky buy column: title/sku/short-desc/member
// price panel + join funnel/qty stepper/cart+quote/trust row), mobile buy bar,
// links row, tabs (index state), related grid (per-card add). Bindings:
// payload (product/pricing/reviews/related/brand/breadcrumbs/lastCrumb) +
// reactive purchase.* scope from the live provider.
// ============================================================================

const CHEVRON: BuilderNode = {
  id: "crumb-sep",
  kind: "element",
  tag: "svg",
  classes: ["h-3.5", "w-3.5", "shrink-0"],
  attrs: {
    viewBox: { kind: "static", value: "0 0 24 24" },
    fill: { kind: "static", value: "none" },
    stroke: { kind: "static", value: "currentColor" },
    "stroke-width": { kind: "static", value: "2" },
  },
  children: [
    {
      id: "crumb-sep-path",
      kind: "element",
      tag: "path",
      attrs: { d: { kind: "static", value: "m9 18 6-6-6-6" } },
    },
  ],
};

function trustIcon(id: string, d: string): BuilderNode {
  return {
    id,
    kind: "element",
    tag: "svg",
    classes: ["h-4", "w-4", "text-accent"],
    attrs: {
      viewBox: { kind: "static", value: "0 0 24 24" },
      fill: { kind: "static", value: "none" },
      stroke: { kind: "static", value: "currentColor" },
      "stroke-width": { kind: "static", value: "1.7" },
    },
    children: [{ id: `${id}-p`, kind: "element", tag: "path", attrs: { d: { kind: "static", value: d } } }],
  };
}

export const SEED_PRODUCT_TREE: NodeTree = {
  v: 1,
  root: {
    id: "pdp-root",
    kind: "element",
    tag: "div",
    children: [
      // ── Breadcrumbs ────────────────────────────────────────────────────────
      {
        id: "crumbs-wrap",
        kind: "element",
        tag: "div",
        classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8", "pt-8"],
        children: [
          {
            id: "crumbs",
            kind: "element",
            tag: "nav",
            classes: ["flex", "flex-wrap", "items-center", "gap-1.5", "text-sm", "text-text-muted", "mb-6"],
            children: [
              {
                id: "crumb-home",
                kind: "element",
                tag: "a",
                classes: ["hover:text-text-secondary", "transition-colors", "duration-300"],
                attrs: { href: { kind: "static", value: "/" } },
                text: [{ kind: "static", value: "Home" }],
              },
              {
                id: "crumbs-repeat",
                kind: "repeat",
                source: "breadcrumbs",
                itemAlias: "crumb",
                children: [
                  {
                    id: "crumb-item",
                    kind: "element",
                    tag: "span",
                    classes: ["flex", "items-center", "gap-1.5"],
                    children: [
                      CHEVRON,
                      {
                        id: "crumb-link",
                        kind: "element",
                        tag: "a",
                        classes: ["hover:text-text-secondary", "transition-colors", "duration-300"],
                        attrs: { href: { kind: "binding", path: "crumb.slug" } },
                        text: [{ kind: "binding", path: "crumb.name" }],
                      },
                    ],
                  },
                ],
              },
              {
                id: "crumb-current",
                kind: "element",
                tag: "span",
                classes: ["text-text-body", "truncate", "max-w-[200px]"],
                text: [{ kind: "binding", path: "product.name" }],
              },
            ],
          },
        ],
      },
      // ── Overview: gallery | buy column ─────────────────────────────────────
      {
        id: "overview-wrap",
        kind: "element",
        tag: "div",
        classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8"],
        children: [
          {
            id: "overview",
            kind: "element",
            tag: "div",
            classes: ["grid", "grid-cols-1", "lg:grid-cols-2", "gap-12"],
            children: [
              // Gallery (image, placeholder fallback)
              {
                id: "gallery",
                kind: "element",
                tag: "div",
                classes: ["h-80", "overflow-hidden", "bg-surface-secondary"],
                children: [
                  {
                    id: "gallery-img",
                    kind: "element",
                    tag: "img",
                    condition: { kind: "data", path: "product.images[0].urlStandard" },
                    classes: ["h-full", "w-full", "object-contain"],
                    attrs: {
                      src: { kind: "binding", path: "product.images[0].urlStandard" },
                      alt: { kind: "binding", path: "product.name" },
                    },
                  },
                  {
                    id: "gallery-empty",
                    kind: "element",
                    tag: "div",
                    condition: { kind: "data", path: "product.images[0].urlStandard", not: true },
                    classes: ["h-full", "w-full", "flex", "items-center", "justify-center", "text-text-muted"],
                    text: [{ kind: "static", value: "No image available" }],
                  },
                ],
              },
              // Buy column
              {
                id: "buy",
                kind: "element",
                tag: "div",
                classes: ["lg:sticky", "lg:top-[150px]", "lg:self-start"],
                children: [
                  {
                    id: "title",
                    kind: "element",
                    tag: "h1",
                    classes: ["heading-serif", "text-[26px]", "leading-tight", "text-text-primary", "sm:text-3xl"],
                    text: [{ kind: "binding", path: "product.name" }],
                  },
                  {
                    id: "meta-row",
                    kind: "element",
                    tag: "div",
                    classes: ["mt-2", "flex", "flex-wrap", "items-center", "gap-x-4", "gap-y-1"],
                    children: [
                      {
                        id: "sku",
                        kind: "element",
                        tag: "p",
                        condition: { kind: "data", path: "product.sku" },
                        classes: ["spec-mono"],
                        text: [{ kind: "static", value: "SKU: " }, { kind: "binding", path: "product.sku" }],
                      },
                    ],
                  },
                  {
                    id: "short-desc",
                    kind: "element",
                    tag: "div",
                    condition: { kind: "data", path: "product.descriptionShort" },
                    classes: ["mt-4"],
                    children: [
                      {
                        id: "short-desc-prose",
                        kind: "element",
                        tag: "div",
                        classes: ["text-sm", "text-steel-500", "prose", "prose-sm"],
                        richBinding: "product.descriptionShort",
                      },
                    ],
                  },
                  // Member price panel + join funnel (guest view)
                  {
                    id: "price-panel",
                    kind: "element",
                    tag: "div",
                    classes: ["mt-5", "rounded-[12px]", "border", "border-border", "border-l-4", "border-l-member", "bg-steel-50", "p-5"],
                    children: [
                      {
                        id: "price-row",
                        kind: "element",
                        tag: "div",
                        classes: ["flex", "flex-wrap", "items-baseline", "gap-x-2", "gap-y-1"],
                        children: [
                          {
                            id: "price-big",
                            kind: "element",
                            tag: "span",
                            classes: ["text-[33px]", "font-bold", "leading-none", "tracking-[-0.02em]", "text-text-primary"],
                            text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.priceDisplay" }],
                          },
                          {
                            id: "price-exgst",
                            kind: "element",
                            tag: "span",
                            classes: ["text-xs", "font-semibold", "text-steel-500"],
                            text: [{ kind: "static", value: "ex GST" }],
                          },
                          {
                            id: "price-badge",
                            kind: "element",
                            tag: "span",
                            condition: { kind: "data", path: "purchase.hasSave" },
                            classes: ["badge-member", "ml-1"],
                            text: [{ kind: "static", value: "Member Price" }],
                          },
                        ],
                      },
                      {
                        id: "rrp-line",
                        kind: "element",
                        tag: "p",
                        condition: { kind: "data", path: "purchase.hasSave" },
                        classes: ["mt-1", "text-steel-500", "text-[13px]"],
                        children: [
                          {
                            id: "rrp-strike",
                            kind: "element",
                            tag: "s",
                            classes: ["text-steel-400"],
                            text: [{ kind: "static", value: "RRP $" }, { kind: "binding", path: "purchase.rrpDisplay" }],
                          },
                          {
                            id: "rrp-save",
                            kind: "element",
                            tag: "b",
                            classes: ["text-member-text"],
                            text: [
                              { kind: "static", value: " You save $" },
                              { kind: "binding", path: "purchase.saveAmount" },
                              { kind: "static", value: " (" },
                              { kind: "binding", path: "purchase.savePct" },
                              { kind: "static", value: "%)" },
                            ],
                          },
                        ],
                      },
                      {
                        id: "join-strip",
                        kind: "element",
                        tag: "div",
                        condition: { kind: "data", path: "pricing.membershipTeaser.fromPrice" },
                        classes: ["mt-3.5", "flex", "items-center", "justify-between", "gap-3", "rounded-btn", "bg-member-bg", "px-3.5", "py-[11px]", "text-[12.5px]", "text-member-text"],
                        children: [
                          {
                            id: "join-copy",
                            kind: "element",
                            tag: "span",
                            text: [
                              { kind: "static", value: "Not a member? Join from $" },
                              { kind: "binding", path: "pricing.membershipTeaser.fromPrice" },
                              { kind: "static", value: "/mo to unlock this price." },
                            ],
                          },
                          {
                            id: "join-cta",
                            kind: "element",
                            tag: "a",
                            classes: ["btn-gold", "btn-sm", "shrink-0"],
                            attrs: { href: { kind: "static", value: "/membership" } },
                            text: [{ kind: "static", value: "Join" }],
                          },
                        ],
                      },
                    ],
                  },
                  // Qty stepper + cart/quote
                  {
                    id: "actions-row",
                    kind: "element",
                    tag: "div",
                    classes: ["mt-6", "flex", "flex-wrap", "items-stretch", "gap-3"],
                    children: [
                      {
                        id: "qty",
                        kind: "element",
                        tag: "div",
                        classes: ["flex", "items-center", "rounded-btn", "border", "border-border-strong", "bg-white"],
                        children: [
                          {
                            id: "qty-dec",
                            kind: "element",
                            tag: "button",
                            classes: ["px-3", "py-3", "text-text-secondary", "transition-colors", "hover:text-text-primary"],
                            events: [{ on: "click", action: { kind: "action", ref: "decrementQuantity" } }],
                            text: [{ kind: "static", value: "−" }],
                          },
                          {
                            id: "qty-num",
                            kind: "element",
                            tag: "span",
                            classes: ["w-8", "text-center", "text-sm", "font-semibold"],
                            text: [{ kind: "binding", path: "purchase.quantity" }],
                          },
                          {
                            id: "qty-inc",
                            kind: "element",
                            tag: "button",
                            classes: ["px-3", "py-3", "text-text-secondary", "transition-colors", "hover:text-text-primary"],
                            events: [{ on: "click", action: { kind: "action", ref: "incrementQuantity" } }],
                            text: [{ kind: "static", value: "+" }],
                          },
                        ],
                      },
                      {
                        id: "cta-col",
                        kind: "element",
                        tag: "div",
                        classes: ["flex", "min-w-0", "flex-1", "flex-col", "gap-2", "sm:flex-row"],
                        children: [
                          {
                            id: "add-to-cart",
                            kind: "element",
                            tag: "button",
                            classes: ["btn-primary", "w-full"],
                            events: [
                              {
                                on: "click",
                                action: {
                                  kind: "action",
                                  ref: "addToCart",
                                  onSuccess: [{ kind: "toast", tone: "success", message: "Added to cart" }],
                                  onError: [{ kind: "toast", tone: "error", message: "Could not add to cart" }],
                                },
                              },
                            ],
                            text: [{ kind: "static", value: "Add to Cart" }],
                          },
                          {
                            id: "add-to-quote",
                            kind: "element",
                            tag: "button",
                            classes: ["btn-secondary", "w-full"],
                            events: [
                              {
                                on: "click",
                                action: {
                                  kind: "action",
                                  ref: "addToQuote",
                                  onSuccess: [{ kind: "toast", tone: "success", message: "Added to quote" }],
                                  onError: [{ kind: "toast", tone: "error", message: "Could not add to quote" }],
                                },
                              },
                            ],
                            text: [{ kind: "static", value: "Add to Quote" }],
                          },
                        ],
                      },
                    ],
                  },
                  // Trust row
                  {
                    id: "trust",
                    kind: "element",
                    tag: "div",
                    classes: ["mt-6", "flex", "flex-wrap", "items-center", "gap-x-5", "gap-y-2", "border-t", "border-border", "pt-4", "text-[13px]", "text-text-secondary"],
                    children: [
                      {
                        id: "trust-ship",
                        kind: "element",
                        tag: "span",
                        classes: ["flex", "items-center", "gap-1.5"],
                        children: [
                          trustIcon("trust-ship-i", "M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11m0 0h6m-6 0v-7h4l3 3v4h-1M8 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"),
                          { id: "trust-ship-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Australia-wide delivery" }] },
                        ],
                      },
                      {
                        id: "trust-warranty",
                        kind: "element",
                        tag: "span",
                        classes: ["flex", "items-center", "gap-1.5"],
                        children: [
                          trustIcon("trust-war-i", "M20 13c0 5-3.5 7.5-7.7 9a.6.6 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1zm-11-1 2 2 4-4"),
                          { id: "trust-war-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Manufacturer warranty" }] },
                        ],
                      },
                      {
                        id: "trust-stock",
                        kind: "element",
                        tag: "span",
                        classes: ["flex", "items-center", "gap-1.5"],
                        children: [
                          trustIcon("trust-stock-i", "m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Zm-18-.27 8.7 5.02M12 22.08V12m4-2.5 2.5 2.5 4-4"),
                          {
                            id: "trust-stock-t", kind: "element", tag: "span",
                            condition: { kind: "data", path: "purchase.inStock" },
                            text: [{ kind: "static", value: "In stock" }],
                          },
                          {
                            id: "trust-stock-out", kind: "element", tag: "span",
                            condition: { kind: "data", path: "purchase.inStock", not: true },
                            text: [{ kind: "static", value: "Check availability" }],
                          },
                        ],
                      },
                    ],
                  },
                  // Mobile buy bar
                  {
                    id: "mobile-bar",
                    kind: "element",
                    tag: "div",
                    classes: ["fixed", "inset-x-0", "bottom-0", "z-[90]", "flex", "items-center", "justify-between", "gap-3", "border-t", "border-border", "bg-white", "px-4", "py-3", "shadow-lg", "lg:hidden"],
                    children: [
                      {
                        id: "mb-price-wrap",
                        kind: "element",
                        tag: "div",
                        classes: ["min-w-0"],
                        children: [
                          {
                            id: "mb-price",
                            kind: "element",
                            tag: "span",
                            classes: ["text-lg", "font-bold", "text-text-primary"],
                            text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.rrpDisplay" }],
                          },
                          {
                            id: "mb-exgst",
                            kind: "element",
                            tag: "span",
                            classes: ["ml-1", "text-[10px]", "font-semibold", "text-steel-400"],
                            text: [{ kind: "static", value: "ex GST" }],
                          },
                        ],
                      },
                      {
                        id: "mb-add",
                        kind: "element",
                        tag: "button",
                        classes: ["btn-primary", "w-full", "btn-sm"],
                        events: [
                          {
                            on: "click",
                            action: {
                              kind: "action",
                              ref: "addToCart",
                              onSuccess: [{ kind: "toast", tone: "success", message: "Added to cart" }],
                              onError: [{ kind: "toast", tone: "error", message: "Could not add to cart" }],
                            },
                          },
                        ],
                        text: [{ kind: "static", value: "Add to Cart" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Links row ───────────────────────────────────────────────────────────
      {
        id: "links-wrap",
        kind: "element",
        tag: "div",
        classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8"],
        children: [
          {
            id: "links-row",
            kind: "element",
            tag: "div",
            classes: ["mt-6", "flex", "flex-wrap", "gap-x-6", "gap-y-2"],
            children: [
              {
                id: "brand-link",
                kind: "element",
                tag: "a",
                condition: { kind: "data", path: "brand.name" },
                classes: ["btn-ghost", "text-[13px]"],
                attrs: { href: { kind: "binding", path: "brand.slug" } },
                text: [{ kind: "static", value: "More from " }, { kind: "binding", path: "brand.name" }],
              },
              {
                id: "category-link",
                kind: "element",
                tag: "a",
                condition: { kind: "data", path: "lastCrumb.name" },
                classes: ["btn-ghost", "text-[13px]"],
                attrs: { href: { kind: "binding", path: "lastCrumb.slug" } },
                text: [{ kind: "static", value: "More in " }, { kind: "binding", path: "lastCrumb.name" }],
              },
            ],
          },
        ],
      },
      // ── Tabs ────────────────────────────────────────────────────────────────
      {
        id: "tabs-wrap",
        kind: "element",
        tag: "div",
        classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8"],
        state: [{ name: "tab", type: "index", initial: 0 }],
        children: [
          {
            id: "tabs",
            kind: "element",
            tag: "div",
            classes: ["mt-12", "border-t", "border-border", "pt-8"],
            children: [
              {
                id: "tab-bar",
                kind: "element",
                tag: "div",
                classes: ["flex", "gap-1", "border-b", "border-border"],
                children: [
                  // each tab: active + inactive variants gated on the index state
                  ...[
                    { i: 0, label: "Description" },
                    { i: 1, label: "Delivery & Warranty" },
                  ].flatMap(({ i, label }) => [
                    {
                      id: `tab-${i}-on`,
                      kind: "element" as const,
                      tag: "button",
                      condition: { kind: "state" as const, ref: "tab", equals: i },
                      classes: ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "border-b-2", "border-text-primary", "text-text-primary"],
                      text: [{ kind: "static" as const, value: label }],
                    },
                    {
                      id: `tab-${i}-off`,
                      kind: "element" as const,
                      tag: "button",
                      condition: { kind: "state" as const, ref: "tab", equals: i, not: true },
                      classes: ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "text-text-secondary", "hover:text-text-primary"],
                      events: [{ on: "click" as const, action: { kind: "local" as const, op: "set-index" as const, target: "tab", value: i } }],
                      text: [{ kind: "static" as const, value: label }],
                    },
                  ]),
                  {
                    id: "tab-2-on",
                    kind: "element",
                    tag: "button",
                    condition: { kind: "state", ref: "tab", equals: 2 },
                    classes: ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "border-b-2", "border-text-primary", "text-text-primary"],
                    text: [{ kind: "static", value: "Reviews (" }, { kind: "binding", path: "reviews.list.length" }, { kind: "static", value: ")" }],
                  },
                  {
                    id: "tab-2-off",
                    kind: "element",
                    tag: "button",
                    condition: { kind: "state", ref: "tab", equals: 2, not: true },
                    classes: ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "text-text-secondary", "hover:text-text-primary"],
                    events: [{ on: "click", action: { kind: "local", op: "set-index", target: "tab", value: 2 } }],
                    text: [{ kind: "static", value: "Reviews (" }, { kind: "binding", path: "reviews.list.length" }, { kind: "static", value: ")" }],
                  },
                ],
              },
              {
                id: "panel-desc",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 0 },
                classes: ["py-6"],
                children: [
                  {
                    id: "panel-desc-prose",
                    kind: "element",
                    tag: "div",
                    classes: ["prose", "prose-sm", "max-w-none", "text-text-secondary"],
                    richBinding: "product.description",
                  },
                ],
              },
              {
                id: "panel-warranty",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 1 },
                classes: ["py-6"],
                children: [
                  {
                    id: "panel-warranty-prose",
                    kind: "element",
                    tag: "div",
                    classes: ["prose", "prose-sm", "max-w-none", "text-text-secondary"],
                    richBinding: "product.warranty",
                  },
                  {
                    id: "panel-delivery-copy",
                    kind: "element",
                    tag: "p",
                    classes: ["mt-4", "text-sm", "text-text-secondary"],
                    text: [{ kind: "static", value: "Australia-wide delivery. Freight is quoted at checkout based on your postcode and the size of your order." }],
                  },
                ],
              },
              {
                id: "panel-reviews",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 2 },
                classes: ["py-6"],
                children: [
                  {
                    id: "reviews-repeat",
                    kind: "repeat",
                    source: "reviews.list",
                    itemAlias: "review",
                    children: [
                      {
                        id: "review-card",
                        kind: "element",
                        tag: "div",
                        classes: ["border-b", "border-border", "py-4"],
                        children: [
                          { id: "review-title", kind: "element", tag: "p", classes: ["text-sm", "font-semibold", "text-text-primary"], text: [{ kind: "binding", path: "review.title" }] },
                          { id: "review-text", kind: "element", tag: "p", classes: ["mt-1", "text-sm", "text-text-secondary"], text: [{ kind: "binding", path: "review.text" }] },
                        ],
                      },
                    ],
                    emptyChildren: [
                      {
                        id: "reviews-empty",
                        kind: "element",
                        tag: "p",
                        classes: ["text-sm", "text-text-muted"],
                        text: [{ kind: "static", value: "No reviews yet." }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Related products ────────────────────────────────────────────────────
      {
        id: "related-wrap",
        kind: "element",
        tag: "div",
        condition: { kind: "data", path: "related.products[0]" },
        classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8", "pb-8"],
        children: [
          {
            id: "related",
            kind: "element",
            tag: "div",
            classes: ["mt-12", "border-t", "border-border", "pt-8"],
            children: [
              {
                id: "related-heading",
                kind: "element",
                tag: "h2",
                classes: ["section-title", "mb-6"],
                text: [{ kind: "static", value: "You may also like" }],
              },
              {
                id: "related-grid",
                kind: "element",
                tag: "div",
                classes: ["grid", "grid-cols-2", "gap-3", "sm:gap-4", "md:grid-cols-3", "lg:grid-cols-4"],
                children: [
                  {
                    id: "related-repeat",
                    kind: "repeat",
                    source: "related.products",
                    itemAlias: "card",
                    limit: 12,
                    children: [
                      {
                        id: "rc",
                        kind: "element",
                        tag: "div",
                        classes: ["group", "relative", "flex", "flex-col", "overflow-hidden", "rounded-card", "border", "border-border", "bg-white", "shadow-sm", "transition-all", "duration-300", "hover:shadow-md"],
                        children: [
                          {
                            id: "rc-img-link",
                            kind: "element",
                            tag: "a",
                            classes: ["relative", "block", "aspect-square", "bg-white"],
                            attrs: { href: { kind: "binding", path: "card.slug" } },
                            children: [
                              {
                                id: "rc-img",
                                kind: "element",
                                tag: "img",
                                condition: { kind: "data", path: "card.imageUrl" },
                                classes: ["h-full", "w-full", "object-contain", "p-3", "transition-transform", "duration-500", "ease-out", "group-hover:scale-[1.04]"],
                                attrs: {
                                  src: { kind: "binding", path: "card.imageUrl" },
                                  alt: { kind: "binding", path: "card.name" },
                                },
                              },
                            ],
                          },
                          {
                            id: "rc-body",
                            kind: "element",
                            tag: "div",
                            classes: ["flex", "flex-1", "flex-col", "p-4"],
                            children: [
                              {
                                id: "rc-name-link",
                                kind: "element",
                                tag: "a",
                                classes: ["block"],
                                attrs: { href: { kind: "binding", path: "card.slug" } },
                                children: [
                                  {
                                    id: "rc-name",
                                    kind: "element",
                                    tag: "h3",
                                    classes: ["line-clamp-2", "min-h-[2.5rem]", "text-[13.5px]", "font-medium", "leading-snug", "text-ink-800", "transition-colors", "duration-200", "group-hover:text-brand"],
                                    text: [{ kind: "binding", path: "card.name" }],
                                  },
                                ],
                              },
                              {
                                id: "rc-sku",
                                kind: "element",
                                tag: "p",
                                condition: { kind: "data", path: "card.sku" },
                                classes: ["spec-mono", "mt-1", "text-steel-400"],
                                text: [{ kind: "binding", path: "card.sku" }],
                              },
                              {
                                id: "rc-price-wrap",
                                kind: "element",
                                tag: "div",
                                classes: ["mt-auto", "pt-2.5"],
                                children: [
                                  {
                                    id: "rc-price-row",
                                    kind: "element",
                                    tag: "div",
                                    classes: ["flex", "flex-wrap", "items-baseline", "gap-x-2", "gap-y-1"],
                                    children: [
                                      {
                                        id: "rc-price",
                                        kind: "element",
                                        tag: "span",
                                        classes: ["text-lg", "font-bold", "leading-none", "tracking-[-0.02em]", "text-text-primary"],
                                        text: [{ kind: "static", value: "$" }, { kind: "binding", path: "card.price", formatters: ["money"] }],
                                      },
                                      {
                                        id: "rc-exgst",
                                        kind: "element",
                                        tag: "span",
                                        classes: ["text-xs", "font-semibold", "text-steel-500"],
                                        text: [{ kind: "static", value: "ex GST" }],
                                      },
                                    ],
                                  },
                                  {
                                    id: "rc-member",
                                    kind: "element",
                                    tag: "p",
                                    condition: { kind: "data", path: "card.memberPrice" },
                                    classes: ["mt-0.5", "flex", "items-center", "gap-1", "text-xs", "font-semibold", "text-member-text"],
                                    text: [{ kind: "static", value: "Member $" }, { kind: "binding", path: "card.memberPrice", formatters: ["money"] }],
                                  },
                                ],
                              },
                              {
                                id: "rc-actions",
                                kind: "element",
                                tag: "div",
                                classes: ["mt-3", "flex", "flex-col", "gap-2"],
                                children: [
                                  {
                                    id: "rc-add",
                                    kind: "element",
                                    tag: "button",
                                    classes: ["btn-primary", "w-full", "btn-sm"],
                                    events: [
                                      {
                                        on: "click",
                                        action: {
                                          kind: "action",
                                          ref: "addToCart",
                                          args: { productId: { kind: "binding", path: "card.id" } },
                                          onSuccess: [{ kind: "toast", tone: "success", message: "Added to cart" }],
                                          onError: [{ kind: "toast", tone: "error", message: "Could not add to cart" }],
                                        },
                                      },
                                    ],
                                    text: [{ kind: "static", value: "Add to Cart" }],
                                  },
                                  {
                                    id: "rc-quote",
                                    kind: "element",
                                    tag: "button",
                                    classes: ["btn-secondary", "w-full", "btn-sm"],
                                    events: [
                                      {
                                        on: "click",
                                        action: {
                                          kind: "action",
                                          ref: "addToQuote",
                                          args: { productId: { kind: "binding", path: "card.id" } },
                                          onSuccess: [{ kind: "toast", tone: "success", message: "Added to quote" }],
                                          onError: [{ kind: "toast", tone: "error", message: "Could not add to quote" }],
                                        },
                                      },
                                    ],
                                    text: [{ kind: "static", value: "Add to Quote" }],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
