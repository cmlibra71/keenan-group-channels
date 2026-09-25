"use client";

// ============================================================================
// A BUNDLE's live build, held ABOVE the purchase provider (card Tc5ekvD6).
//
// Zoey's bundled product prices dynamically: the shopper picks in each group and the price moves.
// The purchase provider (@keenan/services/product-page) owns every amount this page publishes —
// the headline, the member price, the weekly finance figure, the "is this product priced" test
// that decides whether Add to Cart is offered — so the build's total is handed to it the only way
// it reads money: on the product it is given (`withKitPrice`). That is why the selection lives
// here, outside and above it, and why every renderer wraps its provider in `KitPurchaseProvider`
// rather than the provider directly.
//
// Three readers, one state:
//   - the picker (`ProductKitBlock`, drawn by the sealed `product-kit` leaf on the node tree and by
//     `ProductDetail` on the legacy page) reads and writes the selection;
//   - the page's OWN Add to Cart and Add to Quote read `choices` and send them — the page has ONE
//     pair of buy buttons, never a second pair inside the block (7bmpuqei);
//   - the provider reads the total.
// ============================================================================

import * as React from "react";
import {
  ProductPurchaseProvider,
  type PurchaseProduct,
} from "@keenan/services/product-page";
import {
  defaultKitSelection,
  kitBuildTotal,
  memberPriceMapWithKit,
  memberPriceWithKit,
  toKitChoices,
  withKitPrice,
  type KitChoice,
  type KitPrices,
  type ProductKit,
} from "@/lib/product-kit";

export interface KitSelectionState {
  kit: ProductKit;
  /** What each component costs THIS shopper, ex GST (absent = not buyable online here). */
  prices: KitPrices;
  /** Chosen product id per group name; an optional group answered "None" is absent. */
  selection: Record<string, number>;
  /** `null` clears an optional group back to "None". */
  select: (group: string, productId: number | null) => void;
  /** The build as the buy actions take it. Null for a grouped kit, which has no build to send. */
  choices: KitChoice[] | null;
  /** The chosen components' total ex GST, or null when one of them has no price online. */
  total: number | null;
  isBundle: boolean;
}

const KitSelectionContext = React.createContext<KitSelectionState | null>(null);

/** The live build, or null on a product that is not a kit (and outside any provider). */
export function useKitSelection(): KitSelectionState | null {
  return React.useContext(KitSelectionContext);
}

/**
 * The purchase provider with the bundle build priced into it. For a product that is not a bundle
 * this is exactly `ProductPurchaseProvider` — the product object is handed through untouched.
 */
export function KitPurchaseProvider({
  kit,
  kitPrices,
  product,
  memberPrice = null,
  memberPriceMap = {},
  children,
  ...rest
}: {
  kit?: ProductKit | null;
  kitPrices?: KitPrices | null;
  product: PurchaseProduct;
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  loggedIn?: boolean;
  memberSavingsPct?: number;
  accountPricing?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  children: React.ReactNode;
}) {
  const isBundle = kit?.kind === "bundle";
  const [selection, setSelection] = React.useState<Record<string, number>>(() =>
    kit && isBundle ? defaultKitSelection(kit.groups) : {}
  );
  const prices = React.useMemo(() => kitPrices ?? {}, [kitPrices]);
  const total = React.useMemo(
    () => (kit && isBundle ? kitBuildTotal(kit, selection, prices) : 0),
    [kit, isBundle, selection, prices]
  );
  // A price staff hid stays hidden: the provider masks the amounts itself, and nothing is added
  // on top for it to mask — the build's total must never republish a suppressed price.
  const add = isBundle && product.hidePrice !== true ? total : 0;

  const pricedProduct = React.useMemo(() => withKitPrice(product, add), [product, add]);
  const pricedMember = memberPriceWithKit(memberPrice, add);
  const pricedMemberMap = React.useMemo(() => memberPriceMapWithKit(memberPriceMap, add), [memberPriceMap, add]);

  const select = React.useCallback((group: string, productId: number | null) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (productId == null) delete next[group];
      else next[group] = productId;
      return next;
    });
  }, []);

  const value = React.useMemo<KitSelectionState | null>(
    () =>
      kit
        ? {
            kit,
            prices,
            selection,
            select,
            choices: isBundle ? toKitChoices(selection) : null,
            total,
            isBundle,
          }
        : null,
    [kit, prices, selection, select, isBundle, total]
  );

  return (
    <KitSelectionContext.Provider value={value}>
      <ProductPurchaseProvider
        {...rest}
        product={pricedProduct}
        memberPrice={pricedMember}
        memberPriceMap={pricedMemberMap}
      >
        {children}
      </ProductPurchaseProvider>
    </KitSelectionContext.Provider>
  );
}
