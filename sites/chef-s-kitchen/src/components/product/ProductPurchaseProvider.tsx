// ProductPurchaseProvider now lives in @keenan/services/product-page so the
// storefront and the portal editor run the IDENTICAL provider. This file
// re-exports it so existing `@/components/product/ProductPurchaseProvider`
// imports (legacy buy box, v2 widgets, the node bridge) keep working unchanged.
export * from "@keenan/services/product-page";
