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
import { BuilderTree } from "./NodeRenderer";
import { BuilderActionsProvider, type ActionHandler } from "./BuilderActions";

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
}: {
  productId: number;
  tree: NodeTree;
  payload: ProductPagePayload;
}) {
  const purchase = useProductPurchase();
  // Keep handlers reading the LATEST provider state without re-memoizing.
  const ref = React.useRef(purchase);
  ref.current = purchase;

  const handlers = React.useMemo<Record<string, ActionHandler>>(
    () => ({
      addToCart: () => addToCart(productId, ref.current.cartVariantId, ref.current.quantity),
      addToQuote: () => addToQuote(productId, ref.current.cartVariantId),
      selectOption: (args) => {
        ref.current.selectOption(Number(args.optionId), Number(args.valueId));
      },
      setQuantity: (args) => {
        ref.current.setQuantity(Number(args.quantity));
      },
    }),
    [productId]
  );

  return (
    <BuilderActionsProvider handlers={handlers}>
      <BuilderTree tree={tree} payload={payload} />
    </BuilderActionsProvider>
  );
}

export function BuilderProductPage({
  tree,
  payload,
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
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
      <ActionsBridge productId={payload.product.id} tree={tree} payload={payload} />
    </ProductPurchaseProvider>
  );
}
