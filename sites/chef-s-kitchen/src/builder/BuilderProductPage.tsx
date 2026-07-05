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
import { BuilderTree } from "@keenan/services/builder-react";
import { BuilderActionsProvider, type ActionHandler } from "@keenan/services/builder-react";

// ============================================================================
// The Phase-1 product page rendered from a node tree. It reuses the EXISTING
// ProductPurchaseProvider verbatim (checkout logic untouched); a bridge reads
// live purchase state and exposes the named Actions the tree's events wire to
// (addToCart/addToQuote/selectOption/setQuantity) — so a <button> node reaches
// the same server action the current buy box uses. Data binds from the one
// aggregate payload via BuilderTree.
// ============================================================================

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

  // Reactive purchase state exposed to tree bindings as purchase.* — the tree
  // re-renders with the provider (qty display, stock, live price).
  const member = purchase.activeMemberPrice;
  const rrp = purchase.displayPrice;
  const hasSave = member != null && rrp > 0 && member < rrp;
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
      // Display derivations for the member price panel (guest join-funnel).
      priceDisplay: (member ?? rrp).toFixed(2),
      rrpDisplay: rrp.toFixed(2),
      hasSave,
      saveAmount: hasSave ? Math.round(rrp - (member as number)).toString() : "",
      savePct: hasSave ? Math.round(((rrp - (member as number)) / rrp) * 100).toString() : "",
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
