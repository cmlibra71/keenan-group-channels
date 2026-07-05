"use client";
import * as React from "react";
import type { NodeTree, ProductPagePayload } from "@keenan/services/builder";
import {
  ProductPurchaseProvider,
  useProductPurchase,
  type PurchaseProduct,
} from "@/components/product/ProductPurchaseProvider";
import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { useGst, adjustForGst } from "@/lib/gst";
import { BuilderTree } from "@keenan/services/builder-react";
import { BuilderActionsProvider, type ActionHandler } from "@keenan/services/builder-react";

// ============================================================================
// The Phase-1 product page rendered from a node tree. It reuses the EXISTING
// ProductPurchaseProvider verbatim (checkout logic untouched); a bridge reads
// live purchase state and exposes the named Actions the tree's events wire to
// (addToCart/addToQuote/selectOption/setQuantity) — so a <button> node reaches
// the same server action the current buy box uses. Data binds from the one
// aggregate payload via BuilderTree.
//
// Display DECISIONS are computed here, not in the tree (logic stays code):
// nodes carry ONE condition each, so every visible/hidden combination the live
// ProductDetail/PriceBlock pair expresses gets its own precomputed flag.
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ActionsBridge({
  productId,
  tree,
  payload,
  namedStyles,
  components,
}: {
  productId: number;
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  components?: Record<string, NodeTree>;
}) {
  const purchase = useProductPurchase();
  const { inclusive, pricesIncludeTax } = useGst();
  // Keep handlers reading the LATEST provider state without re-memoizing.
  const ref = React.useRef(purchase);
  ref.current = purchase;

  const handlers = React.useMemo<Record<string, ActionHandler>>(
    () => ({
      // args.productId (bound per related-card) overrides the page product.
      addToCart: (args) =>
        args?.productId
          ? addToCart(Number(args.productId), null, 1)
          : addToCart(productId, ref.current.cartVariantId, ref.current.quantity),
      addToQuote: (args) =>
        args?.productId
          ? addToQuote(Number(args.productId), null)
          : addToQuote(productId, ref.current.cartVariantId),
      selectOption: (args) => {
        ref.current.selectOption(Number(args.optionId), Number(args.valueId));
      },
      setQuantity: (args) => {
        ref.current.setQuantity(Number(args.quantity));
      },
      // Codeless steppers wire to these (TS logic lives here, per the design).
      incrementQuantity: () => ref.current.setQuantity(ref.current.quantity + 1),
      decrementQuantity: () => ref.current.setQuantity(Math.max(1, ref.current.quantity - 1)),
    }),
    [productId]
  );

  // ── Pricing display (PriceBlock semantics) ─────────────────────────────────
  // Member price is the headline when it undercuts RRP; RRP struck beside it;
  // the gold join funnel shows for guests only — and only when a deal exists.
  const adj = (n: number) => adjustForGst(n, inclusive, pricesIncludeTax);
  const fmt = (n: number) =>
    adj(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gstLabel = inclusive ? "inc GST" : "ex GST";

  const member = purchase.activeMemberPrice;
  const rrpBase = purchase.displaySalePrice ?? purchase.displayPrice; // PriceBlock's `rrp` input
  const hasPrice = rrpBase > 0; // 0 ⇒ "Call for Price" + quote-only (grouped products before a match, POA products)
  const hasSave = hasPrice && member != null && member > 0 && member < rrpBase;

  const p = purchase.product;
  const hasOptions = purchase.useGroupedMode;
  const cartEnabled =
    hasPrice && purchase.inStock && !purchase.purchasingDisabled && purchase.allOptionsSelected;
  const quoteDisabled = hasOptions && !purchase.allOptionsSelected;

  // Option groups with per-value flags — the tree repeats over these and each
  // value button carries a single isSelected/isDisabled condition.
  const optionGroups = hasOptions
    ? p.options.map((o) => ({
        optionId: o.id,
        name: o.displayName,
        values: p.optionValues
          .filter((v) => v.optionId === o.id)
          .map((v) => ({
            valueId: v.id,
            optionId: o.id,
            label: v.label,
            isSelected: purchase.selectedOptions[o.id] === v.id,
            isDisabled: purchase.disabledValuesPerOption.get(o.id)?.has(v.id) ?? false,
          })),
      }))
    : [];

  // Bulk tiers (live: shown only when rules exist and the product is priced).
  const bulkTiers = hasPrice
    ? p.bulkPricing.map((r) => {
        const amount = parseFloat(r.amount);
        const tierPrice = r.type === "percent" ? rrpBase * (1 - amount / 100) : amount;
        return {
          qty: r.quantityMax ? `${r.quantityMin} – ${r.quantityMax}` : `${r.quantityMin}+`,
          price: fmt(tierPrice),
        };
      })
    : [];

  // Specifications / downloads (payload-derived, static per page — mirrors
  // ProductTabs' specEntries filter and Downloads row copy).
  const specs = React.useMemo(() => {
    const cf = (payload.product.customFields ?? {}) as Record<string, unknown>;
    return Object.entries(cf)
      .filter(
        ([k, v]) =>
          k !== "tabs" &&
          k !== "leaseOptions" &&
          (typeof v === "string" || typeof v === "number") &&
          String(v).trim() !== ""
      )
      .map(([k, v]) => ({
        label: k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: String(v),
      }));
  }, [payload]);
  const downloads = React.useMemo(
    () =>
      payload.attachments.map((f) => ({
        url: f.url,
        name: f.label || f.fileName,
        meta: f.fileSize
          ? `${(f.fileType ?? "").toUpperCase()}${f.fileType ? " · " : ""}${formatFileSize(f.fileSize)}`
          : (f.fileType ?? "").toUpperCase(),
      })),
    [payload]
  );

  const purchaseScope = {
    purchase: {
      quantity: purchase.quantity,
      displayPrice: purchase.displayPrice,
      displaySalePrice: purchase.displaySalePrice,
      activeMemberPrice: member,
      inStock: purchase.inStock,
      allOptionsSelected: purchase.allOptionsSelected,
      purchasingDisabled: purchase.purchasingDisabled,
      variantImageUrl: purchase.variantImageUrl,
      isMember: purchase.isMember,
      gstLabel,
      // Price panel
      hasPrice,
      hasSave,
      priceDisplay: fmt(hasSave ? (member as number) : rrpBase),
      rrpDisplay: fmt(rrpBase),
      saveAmount: hasSave ? Math.round(adj(rrpBase - (member as number))).toLocaleString("en-AU") : "",
      savePct: hasSave
        ? Math.round(((rrpBase - (member as number)) / rrpBase) * 100).toString()
        : "",
      showJoin: hasSave && !purchase.isMember,
      joinFrom: purchase.membershipTeaser?.fromPrice
        ? parseFloat(purchase.membershipTeaser.fromPrice).toFixed(2)
        : "14.95",
      // Buy row — one flag per tree-node condition
      cartEnabled,
      cartDisabledShown: hasPrice && !cartEnabled,
      quotePricedEnabled: hasPrice && !quoteDisabled,
      quotePricedDisabled: hasPrice && quoteDisabled,
      quoteRequestEnabled: !hasPrice && !quoteDisabled,
      quoteRequestDisabled: !hasPrice && quoteDisabled,
      showOutOfStock: hasPrice && !purchase.inStock,
      // Mobile bar (member-aware amount; hidden for unpriced products)
      showMobileBar: hasPrice,
      mobilePriceDisplay: fmt(
        purchase.isMember && member != null && member < rrpBase ? member : rrpBase
      ),
      mobilePriceLabel: purchase.isMember && member != null ? "member" : gstLabel,
      // Options / bulk / tabs data
      hasOptions,
      optionGroups,
      hasBulk: bulkTiers.length > 0,
      bulkTiers,
      hasSpecs: specs.length > 0,
      specs,
      hasDownloads: downloads.length > 0,
      downloads,
    },
  };

  return (
    <BuilderActionsProvider handlers={handlers}>
      <BuilderTree tree={tree} payload={payload} namedStyles={namedStyles} components={components} scope={purchaseScope} />
    </BuilderActionsProvider>
  );
}

export function BuilderProductPage({
  tree,
  payload,
  namedStyles = {},
  components = {},
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
  namedStyles?: Record<string, string[]>;
  components?: Record<string, NodeTree>;
}) {
  // payload.product is the same shape ProductPurchaseProvider expects.
  const product = payload.product as unknown as PurchaseProduct;
  return (
    <ProductPurchaseProvider
      product={product}
      memberPrice={payload.pricing.memberPrice}
      memberPriceMap={payload.pricing.memberPriceMap}
      isMember={payload.pricing.isMember}
      membershipTeaser={payload.pricing.membershipTeaser}
    >
      <ActionsBridge productId={payload.product.id} tree={tree} payload={payload} namedStyles={namedStyles} components={components} />
    </ProductPurchaseProvider>
  );
}
