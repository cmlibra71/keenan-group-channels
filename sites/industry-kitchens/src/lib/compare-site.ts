// Per-site switch for Add to Compare (IK parity plan decision 12, root cause
// `compare-feature`). PER-CHANNEL on purpose — deliberately NOT in
// orchestrator/shared-modules.json.
//
// ON here: the shared `withCompareNode` pass places the sealed `product-compare`
// native (registered in builder/product-natives.tsx) under the product page's buy
// row, and `/compare` (app/compare/page.tsx) renders the visitor's list. Chefs
// Depot and the template carry the same file set to `false`.
export const COMPARE_ENABLED = true;
