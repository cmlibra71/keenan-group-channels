import type { NodeTree } from "@keenan/services/builder";

// Phase-1 seed CD Product Page tree. Representative (not the full pixel-parity
// page — that's the Phase-5 AI conversion): it exercises the whole pipeline —
// data bindings, a condition, a Repeat, and an interactive Action (add-to-cart
// wired to the real server action via the provider). Uses CD design-token
// utility classes so it renders on-brand.
export const SEED_PRODUCT_TREE: NodeTree = {
  v: 1,
  root: {
    id: "pdp-root",
    kind: "element",
    tag: "div",
    classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8", "py-8"],
    children: [
      // Breadcrumbs
      {
        id: "crumbs",
        kind: "element",
        tag: "nav",
        classes: ["flex", "flex-wrap", "items-center", "gap-1.5", "text-sm", "text-text-muted", "mb-6"],
        children: [
          {
            id: "crumbs-repeat",
            kind: "repeat",
            source: "breadcrumbs",
            itemAlias: "crumb",
            children: [
              {
                id: "crumb-link",
                kind: "element",
                tag: "a",
                classes: ["hover:text-text-secondary", "transition-colors"],
                attrs: { href: { kind: "binding", path: "crumb.slug" } },
                text: [{ kind: "binding", path: "crumb.name" }],
              },
            ],
          },
        ],
      },
      // Two-column overview
      {
        id: "overview",
        kind: "element",
        tag: "div",
        classes: ["grid", "grid-cols-1", "lg:grid-cols-2", "gap-8"],
        children: [
          // Gallery (first image)
          {
            id: "gallery",
            kind: "element",
            tag: "div",
            classes: ["rounded-lg", "overflow-hidden", "border", "border-border"],
            children: [
              {
                id: "hero-img",
                kind: "element",
                tag: "img",
                classes: ["w-full", "h-auto", "object-cover"],
                attrs: {
                  src: { kind: "binding", path: "product.images[0].urlStandard" },
                  alt: { kind: "binding", path: "product.name" },
                },
              },
            ],
          },
          // Buy column
          {
            id: "buy",
            kind: "element",
            tag: "div",
            classes: ["lg:sticky", "lg:top-[150px]", "lg:self-start", "flex", "flex-col", "gap-3"],
            children: [
              {
                id: "brand",
                kind: "element",
                tag: "p",
                condition: { kind: "data", path: "brand.name" },
                classes: ["text-[12px]", "font-bold", "uppercase", "tracking-[0.1em]", "text-accent-dark"],
                text: [{ kind: "binding", path: "brand.name" }],
              },
              {
                id: "title",
                kind: "element",
                tag: "h1",
                classes: ["heading-serif", "text-3xl", "text-text-primary", "leading-tight"],
                text: [{ kind: "binding", path: "product.name" }],
              },
              {
                id: "sku",
                kind: "element",
                tag: "p",
                condition: { kind: "data", path: "product.sku" },
                classes: ["spec-mono", "text-sm", "text-text-muted"],
                text: [{ kind: "static", value: "SKU: " }, { kind: "binding", path: "product.sku" }],
              },
              {
                id: "price",
                kind: "element",
                tag: "div",
                classes: ["text-3xl", "font-bold", "text-text-primary", "mt-2"],
                text: [{ kind: "static", value: "$" }, { kind: "binding", path: "product.price", formatters: ["money"] }],
              },
              // Add to cart (interactive — real server action via the provider)
              {
                id: "add-to-cart",
                kind: "element",
                tag: "button",
                classes: ["btn-primary", "mt-4", "w-full"],
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
                text: [{ kind: "static", value: "Add to cart" }],
              },
            ],
          },
        ],
      },
      // Related products
      {
        id: "related",
        kind: "element",
        tag: "section",
        classes: ["mt-16"],
        condition: { kind: "data", path: "related.products" },
        children: [
          {
            id: "related-heading",
            kind: "element",
            tag: "h2",
            classes: ["heading-serif", "text-2xl", "text-text-primary", "mb-6"],
            text: [{ kind: "static", value: "Related products" }],
          },
          {
            id: "related-grid",
            kind: "element",
            tag: "div",
            classes: ["grid", "grid-cols-2", "md:grid-cols-4", "gap-6"],
            children: [
              {
                id: "related-repeat",
                kind: "repeat",
                source: "related.products",
                itemAlias: "card",
                limit: 4,
                children: [
                  {
                    id: "related-card",
                    kind: "element",
                    tag: "a",
                    classes: ["group", "block", "rounded-lg", "border", "border-border", "p-3", "hover:shadow-md", "transition-shadow"],
                    attrs: { href: { kind: "binding", path: "card.slug" } },
                    children: [
                      {
                        id: "related-img",
                        kind: "element",
                        tag: "img",
                        classes: ["w-full", "h-auto", "rounded", "mb-2"],
                        attrs: {
                          src: { kind: "binding", path: "card.imageUrl" },
                          alt: { kind: "binding", path: "card.name" },
                        },
                      },
                      {
                        id: "related-name",
                        kind: "element",
                        tag: "p",
                        classes: ["text-sm", "text-text-body", "line-clamp-2"],
                        text: [{ kind: "binding", path: "card.name" }],
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
