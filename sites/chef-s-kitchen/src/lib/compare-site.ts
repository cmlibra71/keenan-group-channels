// Per-site switch for Add to Compare (IK parity plan decision 12). PER-CHANNEL on
// purpose — deliberately NOT in orchestrator/shared-modules.json.
//
// OFF on this site: the product page gets no compare control (the shared
// `withCompareNode` pass returns the tree untouched) and this site has no
// `/compare` page or `product-compare` native. Industry Kitchens is the only
// storefront whose old site had the feature.
export const COMPARE_ENABLED = false;
