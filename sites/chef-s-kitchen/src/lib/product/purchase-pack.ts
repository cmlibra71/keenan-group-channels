// ============================================================================
// The SELLING UNIT for a FALLBACK product-page renderer's purchase provider (card O108e4jH).
//
// The live page is the authored node tree, whose payload (`@keenan/services` storefront store,
// `productSlice`) resolves Zoey's Quantity Increments & Packaging once, server-side. Chefs Depot's
// three fallback payloads — the legacy route's buy box, the v1 `product_buybox` block and the v2
// `product_overview` block — built their `PurchaseProduct` by hand and never carried it, so on
// those renderers a carton product was "sold individually": no "1 Carton = 2 Pcs" line, a box
// counting pieces, and a cart that then snapped the pieces up to cartons behind the shopper's back.
// `sf-product-page` ("They agree about the SELLING UNIT too") forbids exactly that disagreement.
//
// Same five functions, same order, as the node payload — so the three can never resolve a
// different pack for the same shopper. Pure: the caller supplies the shopper's customer group.
// ============================================================================
import {
  isPackagingOn,
  openingQuantity,
  resolvePackSize,
  resolvePackUnit,
  resolveUnitLabel,
  type PackFacts,
} from "@keenan/services/pack";

export type PurchasePackFields = {
  packSize: number;
  packUnit: string;
  packagingOn: boolean;
  unitLabel: string;
  openingQuantity: number;
};

export function purchasePackFields(
  product: PackFacts | null | undefined,
  customerGroupId: number | null | undefined,
): PurchasePackFields {
  const groupId = customerGroupId ?? null;
  return {
    packSize: resolvePackSize(product, groupId),
    packUnit: resolvePackUnit(product, groupId),
    packagingOn: isPackagingOn(product, groupId),
    unitLabel: resolveUnitLabel(product),
    openingQuantity: openingQuantity(product, groupId),
  };
}
