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
    strokeWidth: { kind: "static", value: "2" },
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

function trustIcon(id: string, colorClass: string, children: BuilderNode[]): BuilderNode {
  return {
    id,
    kind: "element",
    tag: "svg",
    classes: ["h-4", "w-4", colorClass],
    attrs: {
      viewBox: { kind: "static", value: "0 0 24 24" },
      fill: { kind: "static", value: "none" },
      stroke: { kind: "static", value: "currentColor" },
      strokeWidth: { kind: "static", value: "1.7" },
      strokeLinecap: { kind: "static", value: "round" },
      strokeLinejoin: { kind: "static", value: "round" },
    },
    children,
  };
}
function ip(id: string, d: string): BuilderNode {
  return { id, kind: "element", tag: "path", attrs: { d: { kind: "static", value: d } } };
}
function ic(id: string, cx: string, cy: string, r: string): BuilderNode {
  return {
    id, kind: "element", tag: "circle",
    attrs: { cx: { kind: "static", value: cx }, cy: { kind: "static", value: cy }, r: { kind: "static", value: r } },
  };
}
// Exact lucide package-check icon (colour-conditional: text-brand in stock).
function packageCheck(idp: string, colorClass: string): BuilderNode {
  return trustIcon(`${idp}`, colorClass, [
    ip(`${idp}-a`, "m16 16 2 2 4-4"),
    ip(`${idp}-b`, "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"),
    ip(`${idp}-c`, "m7.5 4.27 9 5.15"),
    { id: `${idp}-pl`, kind: "element", tag: "polyline", attrs: { points: { kind: "static", value: "3.29 7 12 12 20.71 7" } } },
    { id: `${idp}-ln`, kind: "element", tag: "line", attrs: { x1: { kind: "static", value: "12" }, x2: { kind: "static", value: "12" }, y1: { kind: "static", value: "22" }, y2: { kind: "static", value: "12" } } },
  ]);
}

// Tab strip: every tab = an active + inactive button pair gated on the shared
// index state. Conditional tabs (Specifications/Downloads) wrap their pair in a
// display-contents span gated on the data flag — indices stay FIXED (0..4) so
// panels never renumber when a tab is absent.
const TAB_ON = ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "border-b-2", "border-text-primary", "text-text-primary"];
const TAB_OFF = ["px-4", "py-2.5", "text-sm", "font-medium", "transition-colors", "duration-300", "text-text-secondary", "hover:text-text-primary"];
type SeedTextPart = { kind: "static"; value: string } | { kind: "binding"; path: string };

function tabPair(i: number, label: SeedTextPart[]): BuilderNode[] {
  return [
    {
      id: `tab-${i}-on`,
      kind: "element",
      tag: "button",
      condition: { kind: "state", ref: "tab", equals: i },
      classes: [...TAB_ON],
      text: label,
    },
    {
      id: `tab-${i}-off`,
      kind: "element",
      tag: "button",
      condition: { kind: "state", ref: "tab", equals: i, not: true },
      classes: [...TAB_OFF],
      events: [{ on: "click", action: { kind: "local", op: "set-index", target: "tab", value: i } }],
      text: label,
    },
  ] as BuilderNode[];
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
            id: "back-to-products",
            kind: "component",
            componentKey: "back-to-products",
            condition: { kind: "data", path: "breadcrumbs[0]", not: true },
          },
          {
            id: "crumbs",
            kind: "element",
            tag: "nav",
            condition: { kind: "data", path: "breadcrumbs[0]" },
            classes: ["flex", "flex-wrap", "items-center", "gap-1.5", "text-sm", "text-text-muted", "mb-6"],
            children: [
              {
                id: "crumb-home",
                kind: "element",
                tag: "a",
                classes: ["hover:text-text-secondary", "transition-colors", "duration-300"],
                attrs: { href: { kind: "static", value: "/products" } },
                text: [{ kind: "static", value: "Products" }],
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
                        attrs: { href: { kind: "binding", path: "crumb.href" } },
                        text: [{ kind: "binding", path: "crumb.name" }],
                      },
                    ],
                  },
                ],
              },
              {
                id: "crumb-sep-final",
                kind: "element",
                tag: "svg",
                classes: ["h-3.5", "w-3.5", "shrink-0"],
                attrs: {
                  viewBox: { kind: "static", value: "0 0 24 24" },
                  fill: { kind: "static", value: "none" },
                  stroke: { kind: "static", value: "currentColor" },
                  strokeWidth: { kind: "static", value: "2" },
                },
                children: [
                  { id: "crumb-sep-final-path", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "m9 18 6-6-6-6" } } },
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
              // Gallery — a NATIVE (non-exploded) component slot: the real
              // ProductImageGallery (zoom/pan/thumbnails/variant image) is
              // slotted in by the bridge via BuilderTree.nativeComponents.
              // First example of a component that does NOT get exploded
              // (Chris's ruling, 2026-07-06).
              {
                id: "gallery",
                kind: "component",
                componentKey: "product-gallery",
                label: "Product gallery (native)",
              },
              // Buy column
              {
                id: "buy",
                kind: "element",
                tag: "div",
                classes: ["lg:sticky", "lg:top-[150px]", "lg:self-start"],
                children: [
                  {
                    id: "brand-eyebrow",
                    kind: "element",
                    tag: "p",
                    condition: { kind: "data", path: "brand.name" },
                    classes: ["mb-1", "text-[12px]", "font-bold", "uppercase", "tracking-[0.1em]", "text-accent-dark"],
                    text: [{ kind: "binding", path: "brand.name" }],
                  },
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
                      {
                        id: "review-summary",
                        kind: "element",
                        tag: "p",
                        condition: { kind: "data", path: "purchase.reviewHasReviews" },
                        classes: ["flex", "items-center", "gap-1", "text-[13px]", "text-text-secondary"],
                        children: [
                          {
                            id: "review-stars",
                            kind: "element",
                            tag: "span",
                            classes: ["text-member"],
                            attrs: { "aria-hidden": { kind: "static", value: "true" } },
                            children: [
                              { id: "review-stars-filled", kind: "element", tag: "span", text: [{ kind: "binding", path: "purchase.reviewFilled" }] },
                              { id: "review-stars-empty", kind: "element", tag: "span", classes: ["text-steel-300"], text: [{ kind: "binding", path: "purchase.reviewEmpty" }] },
                            ],
                          },
                          {
                            id: "review-meta-text",
                            kind: "element",
                            tag: "span",
                            text: [
                              { kind: "binding", path: "purchase.reviewRating" },
                              { kind: "static", value: " · " },
                              { kind: "binding", path: "purchase.reviewCountLabel" },
                            ],
                          },
                        ],
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
                  // Member price panel + join funnel (guest view). Two branches,
                  // mirroring ProductDetail: displayPrice 0 ⇒ "Call for Price"
                  // (grouped products before a variant match, POA products);
                  // otherwise the PriceBlock layout. Member badge / RRP strike /
                  // join funnel all gate on hasSave (= PriceBlock.hasMemberDeal).
                  {
                    id: "price-panel",
                    kind: "element",
                    tag: "div",
                    classes: ["mt-5", "rounded-[12px]", "border", "border-border", "border-l-4", "border-l-member", "bg-steel-50", "p-5"],
                    children: [
                      {
                        id: "cfp",
                        kind: "element",
                        tag: "div",
                        condition: { kind: "data", path: "purchase.hasPrice", not: true },
                        children: [
                          {
                            id: "cfp-head",
                            kind: "element",
                            tag: "p",
                            classes: ["text-2xl", "font-bold", "text-text-primary"],
                            text: [{ kind: "static", value: "Call for Price" }],
                          },
                          {
                            id: "cfp-copy",
                            kind: "element",
                            tag: "p",
                            classes: ["mt-1", "text-[13px]", "text-text-secondary"],
                            text: [{ kind: "static", value: "Add this item to a quote and our sales team will price it for you." }],
                          },
                        ],
                      },
                      {
                        id: "priced",
                        kind: "element",
                        tag: "div",
                        condition: { kind: "data", path: "purchase.hasPrice" },
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
                                text: [{ kind: "binding", path: "purchase.gstLabel" }],
                              },
                              {
                                id: "price-badge",
                                kind: "element",
                                tag: "span",
                                condition: { kind: "data", path: "purchase.hasSave" },
                                classes: ["badge-member", "ml-1"],
                                children: [
                                  {
                                    id: "price-badge-star",
                                    kind: "element",
                                    tag: "svg",
                                    classes: ["h-3", "w-3", "fill-current"],
                                    attrs: {
                                      viewBox: { kind: "static", value: "0 0 24 24" },
                                      fill: { kind: "static", value: "none" },
                                      stroke: { kind: "static", value: "currentColor" },
                                      strokeWidth: { kind: "static", value: "2" },
                                      strokeLinecap: { kind: "static", value: "round" },
                                      strokeLinejoin: { kind: "static", value: "round" },
                                    },
                                    children: [
                                      { id: "price-badge-star-p", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" } } },
                                    ],
                                  },
                                  { id: "price-badge-text", kind: "element", tag: "span", text: [{ kind: "static", value: "Member Price" }] },
                                ],
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
                                id: "rrp-label",
                                kind: "element",
                                tag: "span",
                                text: [{ kind: "static", value: "RRP " }],
                              },
                              {
                                id: "rrp-strike",
                                kind: "element",
                                tag: "s",
                                classes: ["text-steel-400"],
                                text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.rrpDisplay" }],
                              },
                              {
                                id: "rrp-sep",
                                kind: "element",
                                tag: "span",
                                text: [{ kind: "static", value: " · " }],
                              },
                              {
                                id: "rrp-save",
                                kind: "element",
                                tag: "b",
                                classes: ["text-member-text"],
                                text: [
                                  { kind: "static", value: "You save $" },
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
                            condition: { kind: "data", path: "purchase.showJoin" },
                            classes: ["mt-3.5", "flex", "items-center", "justify-between", "gap-3", "rounded-btn", "bg-member-bg", "px-3.5", "py-[11px]", "text-[12.5px]", "text-member-text"],
                            children: [
                              {
                                id: "join-copy",
                                kind: "element",
                                tag: "span",
                                children: [
                                  { id: "join-copy-a", kind: "element", tag: "span", text: [{ kind: "static", value: "Not a member? " }] },
                                  {
                                    id: "join-copy-b",
                                    kind: "element",
                                    tag: "b",
                                    text: [
                                      { kind: "static", value: "Join from $" },
                                      { kind: "binding", path: "purchase.joinFrom" },
                                      { kind: "static", value: "/mo" },
                                    ],
                                  },
                                  { id: "join-copy-c", kind: "element", tag: "span", text: [{ kind: "static", value: " to unlock this price." }] },
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
                    ],
                  },
                  // Bulk pricing tiers (live: bulkPricing.length > 0 && priced)
                  {
                    id: "bulk",
                    kind: "element",
                    tag: "div",
                    condition: { kind: "data", path: "purchase.hasBulk" },
                    classes: ["mt-4"],
                    children: [
                      {
                        id: "bulk-head",
                        kind: "element",
                        tag: "h3",
                        classes: ["text-sm", "font-semibold", "text-text-body", "mb-2"],
                        text: [{ kind: "static", value: "Bulk Pricing" }],
                      },
                      {
                        id: "bulk-card",
                        kind: "element",
                        tag: "div",
                        classes: ["overflow-hidden", "rounded-[12px]", "border", "border-border"],
                        children: [
                          {
                            id: "bulk-table",
                            kind: "element",
                            tag: "table",
                            classes: ["w-full", "text-sm"],
                            children: [
                              {
                                id: "bulk-thead",
                                kind: "element",
                                tag: "thead",
                                children: [
                                  {
                                    id: "bulk-thr",
                                    kind: "element",
                                    tag: "tr",
                                    classes: ["bg-surface-primary", "text-text-secondary"],
                                    children: [
                                      { id: "bulk-th-q", kind: "element", tag: "th", classes: ["px-3", "py-2", "text-left", "font-medium"], text: [{ kind: "static", value: "Quantity" }] },
                                      { id: "bulk-th-p", kind: "element", tag: "th", classes: ["px-3", "py-2", "text-right", "font-medium"], text: [{ kind: "static", value: "Price Per Unit" }] },
                                    ],
                                  },
                                ],
                              },
                              {
                                id: "bulk-tbody",
                                kind: "element",
                                tag: "tbody",
                                classes: ["divide-y", "divide-border"],
                                children: [
                                  {
                                    id: "bulk-repeat",
                                    kind: "repeat",
                                    source: "purchase.bulkTiers",
                                    itemAlias: "tier",
                                    children: [
                                      {
                                        id: "bulk-row",
                                        kind: "element",
                                        tag: "tr",
                                        classes: ["text-text-body"],
                                        children: [
                                          { id: "bulk-td-q", kind: "element", tag: "td", classes: ["px-3", "py-2"], text: [{ kind: "binding", path: "tier.qty" }] },
                                          { id: "bulk-td-p", kind: "element", tag: "td", classes: ["px-3", "py-2", "text-right"], text: [{ kind: "static", value: "$" }, { kind: "binding", path: "tier.price" }] },
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
                  // Grouped option selectors (live: "Configure" card, one group per
                  // option; value buttons rendered as pills for every option type).
                  {
                    id: "options",
                    kind: "element",
                    tag: "div",
                    condition: { kind: "data", path: "purchase.hasOptions" },
                    classes: ["mt-6", "rounded-[12px]", "border", "border-border", "bg-surface-primary", "p-5"],
                    children: [
                      {
                        id: "options-head",
                        kind: "element",
                        tag: "h3",
                        classes: ["text-sm", "font-semibold", "text-text-primary", "mb-4"],
                        text: [{ kind: "static", value: "Configure" }],
                      },
                      {
                        id: "options-list",
                        kind: "element",
                        tag: "div",
                        classes: ["space-y-5"],
                        children: [
                          {
                            id: "options-repeat",
                            kind: "repeat",
                            source: "purchase.optionGroups",
                            itemAlias: "opt",
                            children: [
                              {
                                id: "opt-group",
                                kind: "element",
                                tag: "div",
                                children: [
                                  {
                                    id: "opt-label",
                                    kind: "element",
                                    tag: "label",
                                    classes: ["block", "text-sm", "font-semibold", "text-text-primary", "mb-2"],
                                    text: [{ kind: "binding", path: "opt.name" }],
                                  },
                                  // Dropdown-type option → <select> (matches the live OptionSelector).
                                  {
                                    id: "opt-select",
                                    kind: "element",
                                    tag: "select",
                                    condition: { kind: "data", path: "opt.isDropdown" },
                                    classes: ["w-full", "input"],
                                    attrs: { value: { kind: "binding", path: "opt.selectedValueId" } },
                                    events: [
                                      {
                                        on: "change",
                                        action: {
                                          kind: "action",
                                          ref: "selectOption",
                                          args: {
                                            optionId: { kind: "binding", path: "opt.optionId" },
                                            valueId: { kind: "binding", path: "@value" },
                                          },
                                        },
                                      },
                                    ],
                                    children: [
                                      {
                                        id: "opt-placeholder",
                                        kind: "element",
                                        tag: "option",
                                        attrs: { value: { kind: "static", value: "" } },
                                        text: [{ kind: "static", value: "Select " }, { kind: "binding", path: "opt.name" }],
                                      },
                                      {
                                        id: "opt-opts-repeat",
                                        kind: "repeat",
                                        source: "opt.values",
                                        itemAlias: "val",
                                        children: [
                                          {
                                            id: "opt-opt",
                                            kind: "element",
                                            tag: "option",
                                            attrs: { value: { kind: "binding", path: "val.valueId" } },
                                            text: [{ kind: "binding", path: "val.label" }],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                  {
                                    id: "opt-values",
                                    kind: "element",
                                    tag: "div",
                                    condition: { kind: "data", path: "opt.isDropdown", not: true },
                                    classes: ["flex", "flex-wrap", "gap-2"],
                                    children: [
                                      {
                                        id: "opt-values-repeat",
                                        kind: "repeat",
                                        source: "opt.values",
                                        itemAlias: "val",
                                        children: [
                                          {
                                            id: "opt-val",
                                            kind: "element",
                                            tag: "span",
                                            classes: ["contents"],
                                            children: [
                                              {
                                                id: "opt-val-selected",
                                                kind: "element",
                                                tag: "button",
                                                condition: { kind: "data", path: "val.isSelected" },
                                                classes: ["px-4", "py-2", "border", "text-sm", "transition-colors", "duration-300", "border-text-primary", "bg-surface-dark", "text-white"],
                                                events: [{ on: "click", action: { kind: "action", ref: "selectOption", args: { optionId: { kind: "binding", path: "val.optionId" }, valueId: { kind: "binding", path: "val.valueId" } } } }],
                                                text: [{ kind: "binding", path: "val.label" }],
                                              },
                                              {
                                                id: "opt-val-rest",
                                                kind: "element",
                                                tag: "span",
                                                condition: { kind: "data", path: "val.isSelected", not: true },
                                                classes: ["contents"],
                                                children: [
                                                  {
                                                    id: "opt-val-disabled",
                                                    kind: "element",
                                                    tag: "button",
                                                    condition: { kind: "data", path: "val.isDisabled" },
                                                    classes: ["px-4", "py-2", "border", "text-sm", "transition-colors", "duration-300", "border-border", "text-text-muted", "cursor-not-allowed"],
                                                    text: [{ kind: "binding", path: "val.label" }],
                                                  },
                                                  {
                                                    id: "opt-val-default",
                                                    kind: "element",
                                                    tag: "button",
                                                    condition: { kind: "data", path: "val.isDisabled", not: true },
                                                    classes: ["px-4", "py-2", "border", "text-sm", "transition-colors", "duration-300", "border-border", "hover:border-text-primary/30"],
                                                    events: [{ on: "click", action: { kind: "action", ref: "selectOption", args: { optionId: { kind: "binding", path: "val.optionId" }, valueId: { kind: "binding", path: "val.valueId" } } } }],
                                                    text: [{ kind: "binding", path: "val.label" }],
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
                  // Qty stepper + cart/quote. Live rules (ProductDetail): the
                  // stepper + Add to Cart exist only for priced products; unpriced
                  // products get the single "request pricing" quote CTA; buttons
                  // grey out until options resolve a variant / stock allows.
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
                        condition: { kind: "data", path: "purchase.hasPrice" },
                        classes: ["flex", "items-center", "rounded-btn", "border", "border-border-strong", "bg-white"],
                        children: [
                          {
                            id: "qty-dec",
                            kind: "element",
                            tag: "button",
                            classes: ["px-3", "py-3", "text-text-secondary", "transition-colors", "hover:text-text-primary"],
                            events: [{ on: "click", action: { kind: "action", ref: "decrementQuantity" } }],
                            children: [
                              {
                                id: "qty-dec-icon",
                                kind: "element",
                                tag: "svg",
                                classes: ["h-3.5", "w-3.5"],
                                attrs: {
                                  viewBox: { kind: "static", value: "0 0 24 24" },
                                  fill: { kind: "static", value: "none" },
                                  stroke: { kind: "static", value: "currentColor" },
                                  strokeWidth: { kind: "static", value: "2" },
                                  strokeLinecap: { kind: "static", value: "round" },
                                  strokeLinejoin: { kind: "static", value: "round" },
                                },
                                children: [{ id: "qty-dec-p", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M5 12h14" } } }],
                              },
                            ],
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
                            children: [
                              {
                                id: "qty-inc-icon",
                                kind: "element",
                                tag: "svg",
                                classes: ["h-3.5", "w-3.5"],
                                attrs: {
                                  viewBox: { kind: "static", value: "0 0 24 24" },
                                  fill: { kind: "static", value: "none" },
                                  stroke: { kind: "static", value: "currentColor" },
                                  strokeWidth: { kind: "static", value: "2" },
                                  strokeLinecap: { kind: "static", value: "round" },
                                  strokeLinejoin: { kind: "static", value: "round" },
                                },
                                children: [
                                  { id: "qty-inc-p1", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M5 12h14" } } },
                                  { id: "qty-inc-p2", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M12 5v14" } } },
                                ],
                              },
                            ],
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
                            condition: { kind: "data", path: "purchase.cartEnabled" },
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
                            id: "add-to-cart-off",
                            kind: "element",
                            tag: "button",
                            condition: { kind: "data", path: "purchase.cartDisabledShown" },
                            classes: ["btn-primary", "w-full"],
                            attrs: { disabled: { kind: "static", value: "true" } },
                            text: [{ kind: "static", value: "Add to Cart" }],
                          },
                          {
                            id: "add-to-quote",
                            kind: "element",
                            tag: "button",
                            condition: { kind: "data", path: "purchase.quotePricedEnabled" },
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
                          {
                            id: "add-to-quote-off",
                            kind: "element",
                            tag: "button",
                            condition: { kind: "data", path: "purchase.quotePricedDisabled" },
                            classes: ["btn-secondary", "w-full"],
                            text: [{ kind: "static", value: "Add to Quote" }],
                          },
                          {
                            id: "quote-request",
                            kind: "element",
                            tag: "button",
                            condition: { kind: "data", path: "purchase.quoteRequestEnabled" },
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
                            text: [{ kind: "static", value: "Add to Quote — request pricing" }],
                          },
                          {
                            id: "quote-request-off",
                            kind: "element",
                            tag: "button",
                            condition: { kind: "data", path: "purchase.quoteRequestDisabled" },
                            classes: ["btn-secondary", "w-full"],
                            text: [{ kind: "static", value: "Add to Quote — request pricing" }],
                          },
                        ],
                      },
                    ],
                  },
                  // Ships-to-order note. HARD RULE: the site NEVER says "out of
                  // stock" and never blocks an order — everything drop-ships.
                  {
                    id: "ships-note",
                    kind: "element",
                    tag: "p",
                    condition: { kind: "data", path: "purchase.shipsToOrder" },
                    classes: ["mt-2", "text-[13px]", "font-semibold", "text-text-secondary"],
                    text: [{ kind: "static", value: "Ships to order — Add to Cart or Add to Quote and we'll confirm delivery timing." }],
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
                          trustIcon("trust-ship-i", "text-accent", [
                            ip("trust-ship-p1", "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"),
                            ip("trust-ship-p2", "M15 18H9"),
                            ip("trust-ship-p3", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"),
                            ic("trust-ship-c1", "17", "18", "2"),
                            ic("trust-ship-c2", "7", "18", "2"),
                          ]),
                          { id: "trust-ship-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Australia-wide delivery" }] },
                        ],
                      },
                      {
                        id: "trust-warranty",
                        kind: "element",
                        tag: "span",
                        classes: ["flex", "items-center", "gap-1.5"],
                        children: [
                          trustIcon("trust-war-i", "text-accent", [
                            ip("trust-war-p1", "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"),
                            ip("trust-war-p2", "m9 12 2 2 4-4"),
                          ]),
                          { id: "trust-war-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Manufacturer warranty" }] },
                        ],
                      },
                      {
                        id: "trust-stock",
                        kind: "element",
                        tag: "span",
                        classes: ["flex", "items-center", "gap-1.5"],
                        children: [
                          {
                            id: "trust-stock-in-wrap", kind: "element", tag: "span", classes: ["contents"],
                            condition: { kind: "data", path: "purchase.inStock" },
                            children: [
                              packageCheck("trust-stock-i-in", "text-brand"),
                              { id: "trust-stock-t", kind: "element", tag: "span", text: [{ kind: "static", value: "In stock" }] },
                            ],
                          },
                          {
                            id: "trust-stock-out-wrap", kind: "element", tag: "span", classes: ["contents"],
                            condition: { kind: "data", path: "purchase.inStock", not: true },
                            children: [
                              packageCheck("trust-stock-i-out", "text-steel-400"),
                              { id: "trust-stock-out", kind: "element", tag: "span", text: [{ kind: "static", value: "Check availability" }] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  // Mobile buy bar (live: priced products only; member-aware amount)
                  {
                    id: "mobile-bar",
                    kind: "element",
                    tag: "div",
                    condition: { kind: "data", path: "purchase.showMobileBar" },
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
                            text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.mobilePriceDisplay" }],
                          },
                          {
                            id: "mb-exgst",
                            kind: "element",
                            tag: "span",
                            classes: ["ml-1", "text-[10px]", "font-semibold", "text-steel-400"],
                            text: [{ kind: "binding", path: "purchase.mobilePriceLabel" }],
                          },
                        ],
                      },
                      {
                        id: "mb-add",
                        kind: "element",
                        tag: "button",
                        condition: { kind: "data", path: "purchase.cartEnabled" },
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
                      {
                        id: "mb-add-off",
                        kind: "element",
                        tag: "button",
                        condition: { kind: "data", path: "purchase.cartEnabled", not: true },
                        classes: ["btn-primary", "w-full", "btn-sm"],
                        attrs: { disabled: { kind: "static", value: "true" } },
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
        condition: { kind: "data", path: "purchase.hasLinks" },
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
                attrs: { href: { kind: "binding", path: "brand.href" } },
                text: [{ kind: "static", value: "See all " }, { kind: "binding", path: "brand.name" }, { kind: "static", value: " products →" }],
              },
              {
                id: "category-link",
                kind: "element",
                tag: "a",
                condition: { kind: "data", path: "lastCrumb.name" },
                classes: ["btn-ghost", "text-[13px]"],
                attrs: { href: { kind: "binding", path: "lastCrumb.href" } },
                text: [{ kind: "static", value: "More " }, { kind: "binding", path: "lastCrumb.name" }, { kind: "static", value: " →" }],
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
                  ...tabPair(0, [{ kind: "static", value: "Description" }]),
                  {
                    id: "tab-specs-gate",
                    kind: "element",
                    tag: "span",
                    classes: ["contents"],
                    condition: { kind: "data", path: "purchase.hasSpecs" },
                    children: tabPair(1, [{ kind: "static", value: "Specifications" }]),
                  },
                  ...tabPair(2, [{ kind: "static", value: "Delivery & Warranty" }]),
                  ...tabPair(3, [
                    { kind: "static", value: "Reviews (" },
                    { kind: "binding", path: "reviews.list.length" },
                    { kind: "static", value: ")" },
                  ]),
                  {
                    id: "tab-dl-gate",
                    kind: "element",
                    tag: "span",
                    classes: ["contents"],
                    condition: { kind: "data", path: "purchase.hasDownloads" },
                    children: tabPair(4, [
                      { kind: "static", value: "Downloads (" },
                      { kind: "binding", path: "purchase.downloads.length" },
                      { kind: "static", value: ")" },
                    ]),
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
              // Specifications — key/value table from custom_fields (via bridge scope)
              {
                id: "panel-specs",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 1 },
                classes: ["py-6"],
                children: [
                  {
                    id: "specs-card",
                    kind: "element",
                    tag: "div",
                    classes: ["max-w-2xl", "overflow-hidden", "rounded-card", "border", "border-border"],
                    children: [
                      {
                        id: "specs-table",
                        kind: "element",
                        tag: "table",
                        classes: ["w-full", "text-sm"],
                        children: [
                          {
                            id: "specs-tbody",
                            kind: "element",
                            tag: "tbody",
                            classes: ["divide-y", "divide-border"],
                            children: [
                              {
                                id: "specs-repeat",
                                kind: "repeat",
                                source: "purchase.specs",
                                itemAlias: "spec",
                                children: [
                                  {
                                    id: "spec-row",
                                    kind: "element",
                                    tag: "tr",
                                    children: [
                                      {
                                        id: "spec-key",
                                        kind: "element",
                                        tag: "td",
                                        classes: ["w-2/5", "bg-surface-primary", "px-4", "py-2.5", "font-medium", "text-text-secondary"],
                                        text: [{ kind: "binding", path: "spec.label" }],
                                      },
                                      {
                                        id: "spec-val",
                                        kind: "element",
                                        tag: "td",
                                        classes: ["px-4", "py-2.5", "font-mono", "text-[13px]", "text-text-primary"],
                                        text: [{ kind: "binding", path: "spec.value" }],
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
              {
                id: "panel-warranty",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 2 },
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
                condition: { kind: "state", ref: "tab", equals: 3 },
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
              // Downloads — attachment rows (name + type/size meta, opens in new tab)
              {
                id: "panel-downloads",
                kind: "element",
                tag: "div",
                condition: { kind: "state", ref: "tab", equals: 4 },
                classes: ["py-6"],
                children: [
                  {
                    id: "dl-list",
                    kind: "element",
                    tag: "div",
                    classes: ["space-y-2"],
                    children: [
                      {
                        id: "dl-repeat",
                        kind: "repeat",
                        source: "purchase.downloads",
                        itemAlias: "file",
                        children: [
                          {
                            id: "dl-row",
                            kind: "element",
                            tag: "a",
                            classes: ["flex", "items-center", "gap-3", "card", "px-4", "py-3", "hover:bg-surface-secondary", "transition-colors", "duration-300"],
                            attrs: {
                              href: { kind: "binding", path: "file.url" },
                              target: { kind: "static", value: "_blank" },
                              rel: { kind: "static", value: "noopener noreferrer" },
                            },
                            children: [
                              {
                                id: "dl-icon",
                                kind: "element",
                                tag: "svg",
                                classes: ["h-5", "w-5", "flex-shrink-0", "text-sale"],
                                attrs: {
                                  viewBox: { kind: "static", value: "0 0 24 24" },
                                  fill: { kind: "static", value: "none" },
                                  stroke: { kind: "static", value: "currentColor" },
                                  strokeWidth: { kind: "static", value: "1.5" },
                                },
                                children: [
                                  { id: "dl-icon-p1", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" } } },
                                  { id: "dl-icon-p2", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M14 2v4a2 2 0 0 0 2 2h4" } } },
                                ],
                              },
                              {
                                id: "dl-body",
                                kind: "element",
                                tag: "div",
                                classes: ["flex-1", "min-w-0"],
                                children: [
                                  {
                                    id: "dl-name",
                                    kind: "element",
                                    tag: "p",
                                    classes: ["text-sm", "font-medium", "text-text-primary", "truncate"],
                                    text: [{ kind: "binding", path: "file.name" }],
                                  },
                                  {
                                    id: "dl-meta",
                                    kind: "element",
                                    tag: "p",
                                    condition: { kind: "data", path: "file.meta" },
                                    classes: ["caption"],
                                    text: [{ kind: "binding", path: "file.meta" }],
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
                classes: ["grid", "grid-cols-1", "gap-3", "sm:gap-4", "sm:grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4"],
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
                            attrs: { href: { kind: "binding", path: "card.href" } },
                            children: [
                              {
                                id: "rc-img",
                                kind: "element",
                                tag: "img",
                                condition: { kind: "data", path: "card.imageUrl" },
                                classes: ["object-contain", "p-3", "transition-transform", "duration-500", "ease-out", "group-hover:scale-[1.04]"],
                                attrs: {
                                  src: { kind: "binding", path: "card.imageUrl" },
                                  alt: { kind: "binding", path: "card.name" },
                                  fill: { kind: "static", value: "true" },
                                  sizes: { kind: "static", value: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" },
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
                                attrs: { href: { kind: "binding", path: "card.href" } },
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
                                text: [{ kind: "static", value: "SKU: " }, { kind: "binding", path: "card.sku" }],
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
                                    condition: { kind: "data", path: "card.hasPrice" },
                                    classes: ["flex", "flex-wrap", "items-baseline", "gap-x-2", "gap-y-1"],
                                    children: [
                                      {
                                        id: "rc-price",
                                        kind: "element",
                                        tag: "span",
                                        classes: ["text-lg", "font-bold", "leading-none", "tracking-[-0.02em]", "text-text-primary"],
                                        text: [{ kind: "static", value: "$" }, { kind: "binding", path: "card.headlineDisplay" }],
                                      },
                                      {
                                        id: "rc-exgst",
                                        kind: "element",
                                        tag: "span",
                                        classes: ["text-xs", "font-semibold", "text-steel-500"],
                                        text: [{ kind: "binding", path: "purchase.gstLabel" }],
                                      },
                                    ],
                                  },
                                  {
                                    id: "rc-cfp",
                                    kind: "element",
                                    tag: "p",
                                    condition: { kind: "data", path: "card.hasPrice", not: true },
                                    classes: ["text-sm", "font-semibold", "text-text-secondary"],
                                    text: [{ kind: "static", value: "Call for Price" }],
                                  },
                                  {
                                    id: "rc-rrp",
                                    kind: "element",
                                    tag: "p",
                                    condition: { kind: "data", path: "card.hasDeal" },
                                    classes: ["mt-1", "text-steel-500", "text-xs"],
                                    children: [
                                      { id: "rc-rrp-label", kind: "element", tag: "span", text: [{ kind: "static", value: "RRP " }] },
                                      { id: "rc-rrp-strike", kind: "element", tag: "s", classes: ["text-steel-400"], text: [{ kind: "static", value: "$" }, { kind: "binding", path: "card.rrpDisplay" }] },
                                    ],
                                  },
                                  {
                                    id: "rc-saves",
                                    kind: "element",
                                    tag: "p",
                                    condition: { kind: "data", path: "card.hasDeal" },
                                    classes: ["mt-0.5", "flex", "items-center", "gap-1", "text-xs", "font-semibold", "text-member-text"],
                                    children: [
                                      {
                                        id: "rc-star",
                                        kind: "element",
                                        tag: "svg",
                                        classes: ["h-3", "w-3", "fill-current"],
                                        attrs: {
                                          viewBox: { kind: "static", value: "0 0 24 24" },
                                          fill: { kind: "static", value: "none" },
                                          stroke: { kind: "static", value: "currentColor" },
                                          strokeWidth: { kind: "static", value: "2" },
                                          strokeLinecap: { kind: "static", value: "round" },
                                          strokeLinejoin: { kind: "static", value: "round" },
                                        },
                                        children: [
                                          { id: "rc-star-path", kind: "element", tag: "path", attrs: { d: { kind: "static", value: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" } } },
                                        ],
                                      },
                                      {
                                        id: "rc-saves-text",
                                        kind: "element",
                                        tag: "span",
                                        text: [
                                          { kind: "static", value: "Member saves $" },
                                          { kind: "binding", path: "card.savesDisplay" },
                                          { kind: "static", value: " (" },
                                          { kind: "binding", path: "card.savesPct" },
                                          { kind: "static", value: "%)" },
                                        ],
                                      },
                                    ],
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
                                    condition: { kind: "data", path: "card.hasPrice" },
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
                                    condition: { kind: "data", path: "card.hasPrice" },
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
                                  {
                                    id: "rc-enquire",
                                    kind: "element",
                                    tag: "button",
                                    condition: { kind: "data", path: "card.hasPrice", not: true },
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
                                    text: [{ kind: "static", value: "Enquire" }],
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
